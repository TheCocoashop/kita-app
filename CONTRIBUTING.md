# Mitmachen

Danke, dass du helfen willst. Die App ist klein gehalten, und das soll sie bleiben.

## Aufbau

- `kita-app/`: Oberfläche (reines JavaScript, kein Build-Schritt, keine Abhängigkeiten). `index.html` ohne Server geöffnet zeigt Demo-Daten.
- `nextcloud/kitaapp/`: PHP-Teil der Nextcloud-App (Controller, Dienste, Datenbank-Migration).
- `nextcloud/build.sh`: baut das Installationspaket `nextcloud/kitaapp.tar.gz`.
- `docs/`: Entwürfe und Hintergrund.

## Ausprobieren

1. Demo: `kita-app/index.html` im Browser öffnen.
2. Mit Nextcloud: Paket bauen und in einer Test-Nextcloud nach `custom_apps/` entpacken. `occ upgrade` ausführen, wenn sich die Version ändert.

## Regeln

- Keine Zugangsdaten, echten Namen oder Kinderdaten in Code, Tests, Beispielen, Issues und Screenshots.
- Angaben zu einer bestimmten Einrichtung (Name, Mailadressen, Links) gehören in die App-Einstellungen (`OrgSettings`), nicht in den Code.
- Gesundheitsdaten sparsam behandeln: nur speichern, was nötig ist, und nicht in Mails wiederholen.
- Änderungen klein halten und kurz begründen. Neue Funktionen bitte vorher als Issue vorschlagen.
- Neue Version: Eintrag oben in `kita-app/releases.js` und die Version in `nextcloud/kitaapp/appinfo/info.xml` angleichen.

## Sicherheitslücken

Bitte nicht öffentlich als Issue melden. Nutzt auf der Seite des Projekts unter „Security“ den Knopf „Report a vulnerability“ (privat, nur für die Betreuer sichtbar).
