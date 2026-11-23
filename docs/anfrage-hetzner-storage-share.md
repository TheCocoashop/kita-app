# Anfrage an Hetzner: Storage Share für eine selbst entwickelte Nextcloud-App

Entwurf, 23.11.2026. Zu senden an den Hetzner-Support (oder im Vertriebskontakt vor einer Bestellung). Platzhalter in eckigen Klammern vorher ausfüllen.

---

**Betreff:** Vorabfrage Storage Share: eigene Nextcloud-App, Talk, Collectives

Guten Tag,

wir sind ein gemeinnütziger Verein (Naturkindergarten Dießen e.V.) und betreiben derzeit eine eigene Nextcloud auf einem Hetzner-Cloud-Server. Wir prüfen, ob wir die Nextcloud künftig als Storage Share von Ihnen verwalten lassen können, um den Administrationsaufwand zu senken. Bevor wir etwas bestellen, haben wir einige Fragen, die wir Ihrer Dokumentation nicht entnehmen konnten.

Größenordnung: etwa 35 Konten, rund 1,5 GB Daten, etwa 30 gleichzeitige Nutzer in Spitzenzeiten (Eltern und Team über Handy-Browser und Nextcloud-Apps).

**1. Eigene App (die wichtigste Frage)**
Wir haben eine selbst entwickelte Nextcloud-App („kitaapp“, PHP, nur für uns, nicht im App-Store). Sie wird heute als Ordner unter `custom_apps` abgelegt und per `occ app:enable` bzw. `occ upgrade` aktiviert. Sie nutzt die Nextcloud-Schnittstellen (WebDAV, OCS, Talk-API) und legt eigene Dateien im App-Datenverzeichnis ab.
- Ist es bei Storage Share möglich, eine solche App außerhalb des App-Stores zu installieren und bei Versionsständen zu aktualisieren? Wenn ja, auf welchem Weg (Upload, SFTP, Support-Ticket)?
- Gibt es ein Verzeichnis `custom_apps` oder einen vergleichbaren Ort?

**2. Zugriff**
- Welche `occ`-Befehle stehen im Admin-Panel zur Verfügung? Können `app:enable`, `app:disable`, `upgrade`, `config:app:set` und `files:scan` genutzt werden?
- Gibt es SFTP-, SSH- oder Datenbankzugriff? Falls nein, wie kommen wir an Protokolle (nextcloud.log)?

**3. Apps und Funktionen**
Wir nutzen derzeit: Talk (Chat, Erinnerungen, Antworten), Collectives, Deck, Forms, Mail, Kalender, Kontakte, Passwords, Group folders, Tables, OpenID-Connect-Provider (Anmeldung für einen Fotodienst) und `notify_push` (Push-Benachrichtigungen aufs Handy).
- Welche dieser Apps sind im Storage Share nutzbar?
- Läuft `notify_push` bzw. ist ein Push-Dienst vorhanden? Gibt es für Talk ein HPB/TURN, oder reicht der eingebaute Betrieb für Chat ohne Videoanrufe?
- Welche Nextcloud-Version läuft aktuell, und wie verläuft das Update-Fenster (Zeitpunkt, Vorankündigung, Rückkehr zu einer älteren Version)?

**4. Mailversand**
Die Nextcloud verschickt Mails (Benachrichtigungen, Passwortlinks) über ein externes SMTP-Relay. Kann in Storage Share ein eigener SMTP-Server (Host, Port, Zugang) eingetragen werden?

**5. Domain**
Wir möchten unter einer eigenen Subdomain (zum Beispiel `cloud.naturkindergarten-diessen.de`) erreichbar sein. Die Domain liegt bei Ihnen. Reicht dafür ein CNAME, und werden Zertifikate automatisch ausgestellt?

**6. Umzug**
Können wir einen Export (Konten, Kalender, Kontakte, Dateien, Collectives, Talk-Verläufe) von unserer bestehenden Nextcloud importieren? Gibt es Hinweise oder ein Verfahren für den Umzug? Kann ein Testzugang kurzzeitig genutzt werden, bevor wir uns binden (Hinweis: Wir haben gesehen, dass es keine Mindestlaufzeit gibt)?

**7. Verbindungslimit und Backup**
- Der Tarif NX11 nennt 50 gleichzeitige Verbindungen. Ist damit gemeint, was wir bei etwa 30 Nutzern mit Handy-Apps brauchen (jede App hält mehrere Verbindungen)?
- Wie lange werden die mehrmals täglichen Backups aufbewahrt, und können wir einzelne Dateien oder Kalender wiederherstellen (nicht nur die gesamte Instanz)?

**8. Vertrag und Datenschutz**
Wir benötigen den AV-Vertrag nach Art. 28 DSGVO. Wo wird er abgeschlossen, und gibt es eine Liste der Unterauftragnehmer?

Wir freuen uns über eine Antwort, auch wenn einzelne Punkte nicht möglich sind, das hilft uns bei der Entscheidung.

Vielen Dank und freundliche Grüße
[Name], [Funktion]
Naturkindergarten Dießen e.V.
[Mailadresse]
[Kundennummer, falls vorhanden]
