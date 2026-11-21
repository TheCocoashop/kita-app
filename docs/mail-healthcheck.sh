#!/bin/bash
# Mail-Healthcheck für mailcow (Naturkindergarten Dießen e.V.)
# Prüft alle 15 Min: (1) Zustelltest bis ins Postfach, (2) Fehlrouting lokaler Mails über Brevo,
# (3) Warteschlange. Alarm per Mail an ALERT_TO (geht über den ausgehenden Brevo-Weg).
# Zustand: /var/lib/mail-healthcheck/state  |  Test: MAILCHECK_FORCE_ALARM=1 ./mail-healthcheck.sh
set -u
ALERT_TO="mbeck7@me.com"
CANARY="monitor@naturkindergarten-diessen.de"   # eigenes Testpostfach (Testmails werden wieder gelöscht)
ALERT_FROM="it@naturkindergarten-diessen.de"
DOMAIN_RE='naturkindergarten-diessen\.de'
QUEUE_MAX=20            # Mails in der Warteschlange
QUEUE_AGE_MAX=7200      # Sekunden (2 h)
REALERT=21600           # Alarm höchstens alle 6 h wiederholen
STATE=/var/lib/mail-healthcheck; mkdir -p "$STATE"
exec 9>"$STATE/lock"; flock -n 9 || exit 0

P=$(docker ps -qf name=postfix-mailcow); D=$(docker ps -qf name=dovecot-mailcow)
problems=()

if [ -z "$P" ] || [ -z "$D" ]; then
  problems+=("Postfix- oder Dovecot-Container läuft nicht.")
else
  # 1. Zustelltest
  tok="mailcheck-$(date +%s)-$RANDOM"
  printf 'Subject: %s\nFrom: %s\nTo: %s\n\nAutomatischer Zustelltest, wird gelöscht.\n' "$tok" "$CANARY" "$CANARY" \
    | docker exec -i "$P" sendmail -f "$CANARY" "$CANARY"
  ok=0
  for i in $(seq 1 18); do   # bis 90 s
    sleep 5
    if [ -n "$(docker exec "$D" doveadm search -u "$CANARY" mailbox INBOX subject "$tok" 2>/dev/null)" ]; then ok=1; break; fi
  done
  if [ $ok = 1 ]; then
    docker exec "$D" doveadm expunge -u "$CANARY" mailbox INBOX subject "$tok" >/dev/null 2>&1
  else
    problems+=("Zustelltest fehlgeschlagen: Testmail an $CANARY kam innerhalb von 90 s nicht im Postfach an.")
  fi

  # 2. Lokale Mails dürfen nicht über Brevo laufen
  bad=$(docker logs --since 20m "$P" 2>&1 | grep -E "postfix/smtp\[.*to=<[^>]*@${DOMAIN_RE}>.*relay=smtp-relay\.brevo" | grep -vE "orig_to=" | wc -l)
  [ "$bad" -gt 0 ] && problems+=("$bad Mail(s) an unsere eigene Domain wurden an Brevo statt ins Postfach geschickt (Routing-Fehler, siehe Transport * in Mailcow).")

  # 3. Warteschlange
  q=$(docker exec "$P" postqueue -j 2>/dev/null)
  n=$(printf '%s\n' "$q" | grep -c queue_id)
  oldest=$(printf '%s\n' "$q" | jq -r 'select(.queue_id!=null) | .arrival_time' 2>/dev/null | sort -n | head -1)
  age=0; [ -n "${oldest:-}" ] && age=$(( $(date +%s) - oldest ))
  [ "$n" -gt "$QUEUE_MAX" ] && problems+=("Warteschlange hat $n Mails (Grenze $QUEUE_MAX).")
  [ "$age" -gt "$QUEUE_AGE_MAX" ] && problems+=("Älteste Mail in der Warteschlange ist $((age/3600)) h alt.")
fi
[ "${MAILCHECK_FORCE_ALARM:-0}" = 1 ] && problems+=("TESTALARM (manuell ausgelöst, kein echter Fehler).")

now=$(date +%s); last=$(cat "$STATE/last_alert" 2>/dev/null || echo 0)
send() {  # $1 Betreff, $2 Text
  printf 'Subject: %s\nFrom: %s\nTo: %s\nContent-Type: text/plain; charset=UTF-8\n\n%s\n' "$1" "$ALERT_FROM" "$ALERT_TO" "$2" \
    | docker exec -i "$P" sendmail -f "$ALERT_FROM" "$ALERT_TO"
}
if [ ${#problems[@]} -gt 0 ]; then
  if [ $((now-last)) -ge $REALERT ] || [ "${MAILCHECK_FORCE_ALARM:-0}" = 1 ]; then
    body=$(printf -- '- %s\n' "${problems[@]}")
    send "[KitaCloud] MAILSERVER-ALARM" "Der automatische Mail-Check hat Probleme gefunden:

$body

Server: $(hostname), $(date '+%F %T')
Anleitung: Mailcow-Container (docker compose ps), Postfix-Log (docker logs postfix-mailcow), Mailcow Routing/Transporte prüfen; Referenz-Fix 2026-11-21: custom_transport.pcre mit lmtp-Regel für die eigene Domain."
    echo "$now" > "$STATE/last_alert"; echo 1 > "$STATE/alerting"
  fi
  echo "PROBLEM: ${problems[*]}"
  exit 1
else
  if [ -f "$STATE/alerting" ]; then
    send "[KitaCloud] Mailserver wieder in Ordnung" "Der Mail-Check läuft wieder fehlerfrei ($(date '+%F %T'))."
    rm -f "$STATE/alerting" "$STATE/last_alert"
  fi
  date +%s > "$STATE/last_ok"; echo OK
fi
