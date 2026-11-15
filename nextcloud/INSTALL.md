# KiTa-App installieren

Die App ist eine kleine Nextcloud-App (`kitaapp`). Sie speichert nichts selbst,
sondern zeigt Kalender, Talk, Polls, Kontakte und Collectives der KitaCloud handyfreundlich an.

## 1. Paket auf den Server kopieren

```bash
scp kitaapp.tar.gz <server>:/tmp/
```

Auf dem Server (Pfad und Container-Name an euer Setup anpassen):

```bash
tar -xzf /tmp/kitaapp.tar.gz -C /var/www/html/custom_apps/
chown -R www-data:www-data /var/www/html/custom_apps/kitaapp
```

Läuft Nextcloud in Docker, liegt `custom_apps` meist im gemounteten Volume,
oder ihr kopiert mit `docker cp kitaapp <container>:/var/www/html/custom_apps/`.

## 2. Erst nur für Admins freischalten

```bash
occ app:enable kitaapp --groups admin
```

Die Eltern sehen die App dann noch nicht. Aufrufen unter:

    https://<eure-nextcloud>/apps/kitaapp/

(ohne „Pretty URLs“: `/index.php/apps/kitaapp/`)

## 3. Einstellungen

Angaben zur Einrichtung (Mails und Absender, Name im Mailfuß):

```bash
occ config:app:set kitaapp org_name     --value="Kindergarten Beispiel e.V."          # Fuß von Mails
occ config:app:set kitaapp org_short    --value="Kindergarten Beispiel"               # Absendername, App-Name
occ config:app:set kitaapp mail_from    --value="no-reply@example.org"                # leer = Standard-Absender der Nextcloud
occ config:app:set kitaapp mail_contact --value="info@example.org"                    # Antwortadresse, leer = keine
occ config:app:set kitaapp mail_it      --value="it@example.org"                      # Hilfe bei fehlender Mailadresse, leer = „beim Team melden“
occ config:app:set kitaapp photo_host   --value="https://fotos.example.org"           # Immich, leer = Fotoauswahl aus
```

Gruppen, Kalender und Handbuch (Standardwerte in Klammern):

```bash
occ config:app:set kitaapp collective --value="Elternhandbuch"
occ config:app:set kitaapp calendar    --value="eltern"   # vorausgewählter Kalender beim Eintragen (Teil des Namens)
occ config:app:set kitaapp addressbook --value="eltern"   # Adressbuch für die Elternliste (Teil des Namens)
occ config:app:set kitaapp month_groups --value="Vorstand,Team-Kita"   # wer die Monatsübersicht sieht (* = alle)
occ config:app:set kitaapp diary_groups --value="Team-Kita"            # wer den Wochenrückblick schreibt
occ config:app:set kitaapp ank_group    --value="Vorstand"              # wer Meldungen auf der Startseite anlegt
occ config:app:set kitaapp notify_group --value="Eltern"                # wer die Meldungs-Mail bekommt
```

Wochenrückblick und Putzdienst (Links zu Seiten im Handbuch oder Formularen, leer = ohne):

```bash
occ config:app:set kitaapp diary_mail_to      --value="eltern@example.org"   # Verteiler für die Rückblick-Mail, leer = keine Mail
occ config:app:set kitaapp diary_url          --value="https://…/apps/collectives/…"
occ config:app:set kitaapp putz_tasks_url     --value="https://…"
occ config:app:set kitaapp putz_checklist_url --value="https://…"
```

Abwesenheitsmeldung (zuerst nur fürs Team testen, dann für alle):

```bash
occ config:app:set kitaapp absence_mode      --value="team"   # off | team | on
occ config:app:set kitaapp absence_groups    --value="Vorstand,Team-Kita"   # wer die Liste sieht
occ config:app:set kitaapp absence_team_mail --value=""       # Adresse für die Mail bei Meldung für heute, leer = keine
occ config:app:set kitaapp absence_retention --value="24"     # Aufbewahrung in Monaten
```

Logo in der Rückblick-Mail (optional): eine PNG-Datei als `custom_apps/kitaapp/img/mail-logo.png` ablegen (etwa 190 Pixel breit angezeigt, besser doppelt so groß). Ohne Datei erscheint die Mail ohne Logo. Das Logo gehört nicht ins Repository, es liegt in der Regel bei der Einrichtung. Updates überschreiben die Datei nicht.

Die Familien der Eltern kommen aus den Elternkarten im Adressbuch (Notiz: `Eltern: …` und `Kinder: Name (geb. TT.MM.JJJJ); …`). Die Prüfseite in der App zeigt, was noch fehlt.

## 4. Für alle freischalten

```bash
occ app:enable kitaapp
```

Eltern öffnen die Adresse oben in Safari (iPhone) oder Chrome (Android) und melden
sich an. Auf der Startseite erscheint dann der Hinweis „KiTa-App auf den
Home-Bildschirm“:

- Android: „So geht's“ öffnet, wenn Chrome es anbietet, direkt das Installieren-Fenster,
  sonst eine Schritt-für-Schritt-Anleitung.
- iPhone: Schritt-für-Schritt-Anleitung mit Pfeil (Apple erlaubt keinen Knopf dafür).
- In Facebook/Instagram & Co. geöffnet: Hinweis, die Adresse in Safari/Chrome zu öffnen.

„Später“ blendet den Hinweis für 14 Tage aus; als installierte App erscheint er nicht mehr.
Am Computer kann man die Anleitungen mit `…/apps/kitaapp/?install=ios`
(bzw. `android`, `inapp`) ansehen.

Auf dem iPhone muss man sich in der Home-Bildschirm-App einmal neu anmelden
(sie hat eigene Cookies, getrennt von Safari).

## Update einspielen

Neues Paket wie in Schritt 1 über den alten Ordner entpacken. Die Handys laden die neuen
Dateien beim nächsten Öffnen. Die Einstellung `fotos_url` aus älteren Versionen wird nicht
mehr gebraucht (`occ config:app:delete kitaapp fotos_url`).

## Wieder entfernen

```bash
occ app:disable kitaapp
rm -rf /var/www/html/custom_apps/kitaapp
```

## Woher die Daten kommen

| Reiter | Quelle | Hinweis |
|---|---|---|
| Termine | alle Kalender des Nutzers (CalDAV) | Im Kalender „Putzdienst“ werden nur Einträge der eigenen Familie gezeigt: „Putzdienst: Muster“ passt, wenn „Muster“ im Anzeigenamen steht. **Eintragen** geht in alle Kalender, für die der Nutzer Schreibrechte hat (in Nextcloud „Kann bearbeiten“ freigegeben); der Kalender mit „eltern“ im Namen ist vorausgewählt. Ohne Schreibrecht erscheint der Knopf nicht. |
| Chat | Talk-Unterhaltungen des Nutzers | Aktualisiert sich alle 10 Sekunden, solange der Chat offen ist. Push gibt es nur mit der Talk-App. |
| Umfragen (oberste Zeile im Reiter Termine) | Polls-App | Text-Umfragen: Abstimmen mit „Ja“ pro Option. Terminumfragen: bei jeder Zeit „Passt“, „Vielleicht“ (wenn erlaubt) oder „Geht nicht“. **Neue Umfragen** (Antworten oder Termine) bekommen Zugriff „Alle Nutzer“ (open). Klappt nur, wenn in den Polls-Einstellungen das Anlegen und „öffentliche Umfragen für alle“ für Eltern erlaubt sind. |
| Handbuch | Collective „Elternhandbuch“ | Seiten der ersten Ebene, Bilder als verkleinerte Vorschau. Die Suche (Lupe) durchsucht alle Seiten dieses Handbuchs. |
| Kontakte (Elternliste) | Adressbücher (CardDAV) mit „eltern“ im Namen, sonst alle Adressbücher des Nutzers | Das Adressbuch muss mit den Eltern (z. B. Gruppe) geteilt sein. Nextcloud-Konten und „Zuletzt kontaktiert“ werden nicht gezeigt. Anrufen, SMS, E-Mail, Karte und „In meinen Handy-Kontakten speichern“. |

## Putzdienst tauschen

Eltern haben im Kalender „Putzdienst“ nur Leserechte. Der Tausch läuft über die App: eine Familie stellt eine Anfrage
(eigener Dienst gegen den einer anderen Familie), die andere bestätigt, dann schreibt der **Server** die Familiennamen in den
Kalender. Rückgängig geht 48 Stunden lang. Beide Familien bekommen eine Mail (über den Mailversand der Nextcloud).

Einstellungen:

```bash
occ config:app:set kitaapp putz_calendar --type=integer --value=8   # ID des Kalenders „Putzdienst“ (oc_calendars.id)
occ config:app:set kitaapp families --value='{"Muster":["a@example.org","b@example.org"], …}'   # Familie => E-Mail-Adressen
```

Die Familie eines Nutzers wird über dessen E-Mail-Adresse in `families` erkannt (Ersatz: Familienname im Anzeigenamen).

Nach dem Einspielen einer Version mit neuen Routen den Webserver neu laden (die Routen liegen im Zwischenspeicher):
`docker exec kita_nextcloud apache2ctl -k graceful`
