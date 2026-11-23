// Versionen der KiTa-App mit Neuigkeiten für die Eltern. Neueste zuerst.
// Bei jedem Update hier oben einen Eintrag ergänzen und die Version in
// nextcloud/kitaapp/appinfo/info.xml angleichen.
const RELEASES = [
  {
    version: '1.9.2', date: '2026-11-23',
    notes: [
      'Die Rückblick-Mail enthält jetzt den ganzen Text. Wer die App nicht öffnen mag, kann alles in der Mail lesen. Der Knopf „Im Handbuch ansehen“ bleibt.',
    ],
  },
  {
    version: '1.9.1', date: '2026-11-23',
    notes: [
      'Im Hintergrund: Die Rückblick-Mail hat keine Antwortadresse mehr. Statt „Antworte einfach auf diese Mail“ führt ein Link in den Eltern-Chat.',
    ],
  },
  {
    version: '1.9.0', date: '2026-11-23',
    notes: [
      'Chat: Unter jeder Nachricht gibt es jetzt „⋯“. Dort kannst du antworten (die Antwort zeigt ein Zitat), die Nachricht kopieren und dich an sie erinnern lassen (in 1 Stunde, heute Abend, morgen früh oder nächste Woche).',
      'Chat: Eigene Nachrichten kannst du kurz nach dem Senden bearbeiten oder löschen. Das erlaubt Talk nur für wenige Stunden.',
    ],
  },
  {
    version: '1.8.0', date: '2026-11-21',
    notes: [
      'Umfragen: Unter jeder Antwort steht jetzt „Wer? (3)“. Ein Tipp darauf zeigt die Namen derer, die so abgestimmt haben. So sieht auch die Person, die die Umfrage angelegt hat, wer geantwortet hat.',
    ],
  },
  {
    version: '1.7.4', date: '2026-11-21',
    notes: [
      'Umfragen: Ist eine Umfrage nicht für alle freigegeben, steht jetzt „Diese Umfrage ist für dich nicht freigegeben“ statt einer Fehlermeldung.',
    ],
  },
  {
    version: '1.7.3', date: '2026-11-19',
    notes: [
      'Umfragen: Unten gibt es jetzt „Link zur Umfrage teilen“. Der Link öffnet die Umfrage in der KiTa-App-Seite statt in der Nextcloud-Webseite.',
      'Abwesend: Die Anmerkung bei „sonstiges“ ist auf 30 Zeichen begrenzt.',
    ],
  },
  {
    version: '1.7.2', date: '2026-11-19',
    notes: [
      'Abwesend: Bei „sonstiges“ gibt es jetzt ein kurzes Feld für eine Anmerkung, zum Beispiel „Arzttermin um 9 Uhr“. „Arzttermin“ als eigene Auswahl entfällt.',
    ],
  },
  {
    version: '1.7.1', date: '2026-11-19',
    notes: [
      'Chat: Auf Nachrichten kann jetzt mit Emojis reagiert werden. Auf „＋☺“ unter der Nachricht tippen und ein Emoji wählen. Ein Emoji, das schon da ist, tippt man an, um sich anzuschließen oder die eigene Reaktion zurückzunehmen. Die Reaktionen sind auch in der Nextcloud (Talk) zu sehen.',
    ],
  },
  {
    version: '1.7.0', date: '2026-11-19',
    notes: [
      'Abwesend: Die Auswahl (krank, Urlaub, Arzttermin, sonstiges) ist jetzt deutlich markiert.',
      'Abwesend: Neu ist „kommt später“ und „geht früher“ mit Uhrzeit, zum Beispiel bei einem Arzttermin um 9 Uhr.',
      'Abwesend: Ein Kind lässt sich für denselben Zeitraum nur einmal melden. Wer etwas ändern will, zieht die alte Meldung zurück.',
      'Umfragen: Der gewählte Eintrag ist jetzt ebenfalls deutlich markiert.',
    ],
  },
  {
    version: '1.6.4', date: '2026-11-15',
    notes: [
      'Suche: Das gesuchte Wort wird auch im Titel des Treffers markiert.',
    ],
  },
  {
    version: '1.6.3', date: '2026-11-15',
    notes: [
      'Suche: Das gesuchte Wort ist in den Treffern jetzt deutlicher markiert, und der Seitentitel wird im Ausschnitt nicht mehr wiederholt.',
    ],
  },
  {
    version: '1.6.2', date: '2026-11-15',
    notes: [
      'Im Hintergrund: Das Logo in der Rückblick-Mail wird nur noch eingebunden, wenn es auf dem Server liegt. Für euch ändert sich nichts.',
    ],
  },
  {
    version: '1.6.1', date: '2026-11-15',
    notes: [
      'Im Hintergrund aufgeräumt: Angaben zum Kindergarten (Name, Mailadressen) stehen jetzt in den Einstellungen. Für euch ändert sich nichts.',
    ],
  },
  {
    version: '1.6.0', date: '2026-11-15',
    notes: [
      'Neu: Suche. Oben rechts auf die Lupe tippen und nach einem Wort suchen. Die App durchsucht das Elternhandbuch und die Elternliste.',
    ],
  },
  {
    version: '1.5.0', date: '2026-11-13',
    notes: [
      'Termine: Das Team kann Termine jetzt auch in der App bearbeiten.',
      'Neu für das Team: „Abwesend“. Die Liste zeigt, welche Kinder heute und in den nächsten Tagen fehlen. Die Eltern melden ihr Kind später selbst in der App (zunächst nur zum Testen für das Team sichtbar).',
    ],
  },
  {
    version: '1.4.6', date: '2026-11-10',
    notes: [
      'Startseite: „Aus dem Tagebuch“ zeigt jetzt immer den neuesten Eintrag, auch wenn er nicht „Wochenrückblick“ heißt (z. B. Herbstferienwoche).',
    ],
  },
  {
    version: '1.4.5', date: '2026-11-09',
    notes: [
      'Die E-Mail zum neuen Wochenrückblick sieht jetzt schöner aus: mit Logo, persönlicher Begrüßung, Auszug und Knopf zum Lesen.',
      'Wochenrückblick: Aus dem Fotoalbum lässt sich ein Titelbild wählen. Es erscheint im Tagebuch und in der E-Mail.',
    ],
  },
  {
    version: '1.4.4', date: '2026-11-08',
    notes: [
      'Wochenrückblick: „Veröffentlichen“ funktioniert jetzt. Bisher kam die Meldung „Bitte einen Titel eingeben“.',
    ],
  },
  {
    version: '1.4.3', date: '2026-11-06',
    notes: [
      'Meldungen: Der Knopf kann jetzt direkt auf eine Handbuch-Seite zeigen (Auswahl „Handbuch-Seite“). Eingefügte Cloud-Links werden automatisch passend umgewandelt.',
    ],
  },
  {
    version: '1.4.2', date: '2026-11-06',
    notes: [
      'Putzdienst tauschen: „Tauschen“, „Ablehnen“ und „Zurückziehen“ funktionieren jetzt. Bisher kam dabei nur eine Fehlermeldung.',
    ],
  },
  {
    version: '1.4.1', date: '2026-11-06',
    notes: [
      'PDF-Dateien aus dem Handbuch (z. B. Laternenlieder) öffnen sich jetzt auch auf dem iPhone.',
    ],
  },
  {
    version: '1.4.0', date: '2026-11-06',
    notes: [
      'Vorstand und Team können Termine jetzt direkt in der App ändern: bei dem Termin auf den Stift ✏️ tippen.',
      'Der Waldaktionstag beginnt um 10 Uhr.',
    ],
  },
  {
    version: '1.3.1', date: '2026-11-05',
    notes: [
      'Einheitliche Namen: Die App auf dem Handy heißt „KiTa-App“, die Cloud im Browser „KitaCloud“.',
    ],
  },
  {
    version: '1.3.0', date: '2026-11-05',
    notes: [
      'Umfragen: Wo es erlaubt ist, könnt ihr jetzt eigene Antworten vorschlagen.',
      'Wer eine Umfrage anlegt, kann das mit einem Haken an- oder ausschalten.',
    ],
  },
  {
    version: '1.2.0', date: '2026-11-04',
    notes: [
      'Termine: Die Monatsansicht gibt es jetzt für alle.',
      'Neu: Versionsnummer und diese Übersicht „Was ist neu?“.',
      'Im Handbuch ist die Seite „Willkommen in der KitaCloud“ überarbeitet und beschreibt jetzt die KiTa-App.',
      'Das Team schreibt den Wochenrückblick jetzt direkt in der App.',
    ],
  },
  {
    version: '1.1.0', date: '2026-11-03',
    notes: [
      'Termine: Ein Tipp auf einen Termin zeigt die Beschreibung und den Ort.',
      'Termine, die mehrfach im Kalender stehen, erscheinen nur noch einmal.',
      'Chat: Gelesene Unterhaltungen verlieren ihre Zahl wieder.',
      'Kontakte: Telefonnummern und E-Mail-Adressen zeigen, zu welchem Elternteil sie gehören.',
      'Wer Putzdienst hat, sieht auf der Startseite die Karte „Euer Putzdienst“ mit Aufgabenliste und Checkliste.',
    ],
  },
  {
    version: '1.0.0', date: '2026-11-01',
    notes: [
      'Start der KiTa-App für alle Eltern: Termine, Chat, Kontakte, Umfragen, Handbuch.',
      'Putzdienst tauschen: Anfrage an die andere Familie, der Kalender passt sich automatisch an.',
      'Meldungen vom Vorstand erscheinen oben auf der Startseite.',
    ],
  },
];
const APP_VERSION = RELEASES[0].version;
