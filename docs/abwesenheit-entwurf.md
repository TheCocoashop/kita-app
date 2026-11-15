# Modul „Abwesenheit“ – Entwurf

Stand: 12.11.2026. Noch nichts davon ist gebaut. Zur Abstimmung, bevor Code entsteht.

Ziel: Eltern melden ihr Kind in wenigen Sekunden ab (krank, Urlaub, sonstiges). Das Team sieht morgens eine Liste „Heute fehlen“. Später kommt die Anwesenheit zum Abhaken am Treffpunkt dazu. Das Modul soll für andere Kindergärten ohne Anpassung am Code laufen.

## 1. Familien und Kinder: eine Quelle, die Kontakte

Die Kontakte (Adressbuch „KiTa-Kontakte“) bleiben die einzige Quelle. Eine Elternkarte = eine Familie.

**Schreibweise in der Notiz der Karte** (so steht es bei den 16 Elternkarten, aufgeräumt am 12.11.2026):

```
Eltern: Vorname Nachname; Vorname Nachname
Kinder: Vorname (geb. TT.MM.JJJJ); Vorname (geb. TT.MM.JJJJ)
```

- Trenner zwischen mehreren Personen: Semikolon.
- Nur Einträge mit Geburtsdatum zählen als Kind im Kindergarten. Geschwister ohne Datum („Benedikt (Geschwister)“) tauchen in der Meldung nicht auf.
- Eine Gruppe pro Kind gibt es nicht: Bei uns gibt es nur eine Gruppe. Für andere Kindergärten kann die Gruppe optional in die Klammer („geb. …, Gruppe“) kommen.
- Die App liest die Schreibweise tolerant (auch `\;`, fehlender Zeilenumbruch vor „Kinder“, Zusätze wie „(gesch.)“). Die Karten müssen für den Start nicht umgeschrieben werden. Die Prüfseite zeigt nur, was fehlt oder verwirrend ist.

**Zuordnung Login zu Familie:** über die Mailadresse. Die Adresse des Nextcloud-Benutzers muss in der Elternkarte stehen. Eltern sehen nur die Kinder aus ihrer eigenen Karte und können nur diese melden.

## 2. Datenmodell (in der KiTa-App-Datenbank)

Tabelle `kitaapp_absence`:

| Feld | Inhalt |
|---|---|
| id | laufende Nummer |
| card_uid | Kennung der Familienkarte |
| child | Vorname des Kindes, so wie in der Notiz |
| group_name | Gruppe, nur wenn der Kindergarten Gruppen nutzt (sonst leer) |
| from_date, to_date | Zeitraum, einschließlich |
| kind | `krank`, `urlaub` oder `sonstiges` |
| reported_by | Nextcloud-Benutzer |
| reported_at | Zeitpunkt |
| cancelled | 0 oder 1 (Meldung zurückgezogen) |

Keine Freitextfelder und kein Grund oder Diagnose. Das ist Absicht (Gesundheitsdaten).

## 3. Bildschirme

**Eltern**
- Startseite: Knopf „Kind abwesend melden“.
- Formular: Kind wählen (bei einem Kind ist es vorausgewählt), von bis (Standard heute bis heute), Art (krank, Urlaub, sonstiges), „Melden“.
- Danach: „Danke, ihr seid abgemeldet“ und eine Liste der eigenen laufenden Meldungen mit „Zurückziehen“.

**Team (Gruppe Team und Vorstand)**
- Seite „Heute“: Liste der Kinder, die heute fehlen, alphabetisch (bei Gruppen: nach Gruppe), mit Art und Zeitraum. Oben die Zahl.
- Seite „Woche“: Übersicht der kommenden Tage.
- Meldung per Push oder Mail an `team@`, wenn bis zu einer festen Uhrzeit (Standard 08:30) etwas Neues eingeht.

## 4. Prüfseite für das Team

„Stimmen die Daten?“ zeigt auf einen Blick:
- Elternkarten ohne Kinder-Zeile.
- Kinder-Zeilen, die von der Schreibweise abweichen (mit Zeile und Vorschlag).
- Nextcloud-Benutzer, deren Mailadresse in keiner Elternkarte steht. Sie könnten kein Kind melden.

Damit sieht jeder Kindergarten sofort, was noch einzutragen ist. Es wird nichts automatisch geändert.

## 5. Datenschutz

- Gespeichert werden nur Vorname, Zeitraum und Art. Keine Diagnose, kein Freitext.
- Sichtbar nur für die Familie selbst, das Team und den Vorstand.
- Alte Meldungen werden nach einer einstellbaren Frist gelöscht (Standard: 24 Monate).
- Die Mail an das Team nennt Namen und Datum, aber nie den Grund.

## 6. Einstellungen für andere Kindergärten (später, Teil des Pakets)

```
modul_abwesenheit: ja
gruppen: []            # leer, wenn es nur eine Gruppe gibt
meldeschluss: "08:30"
aufbewahrung_monate: 24
team_adresse: team@…
```

Gibt es nur eine Gruppe, bleibt `gruppen` leer und die Listen werden nicht nach Gruppen aufgeteilt.

## 7. Reihenfolge

1. Prüfseite und tolerante Leselogik für die Kinder-Zeile (die Elternkarten sind schon aufgeräumt).
2. Meldung durch die Eltern und Tagesliste für das Team.
3. Mailadressen der Eltern in den Karten ergänzen, wo sie fehlen.
4. Anwesenheit am Treffpunkt abhaken, Monatsübersicht und Export.
5. Einstellungsdatei und Modul-Schalter für das Paket für andere Kindergärten.
