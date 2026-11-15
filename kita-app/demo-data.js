// Erfundene Beispieldaten für den Demo-Modus. Termine liegen relativ zu heute.
(function () {
  const day = 24 * 3600 * 1000;
  const at = (offsetDays, h = 0, m = 0) => {
    const d = new Date(); d.setHours(h, m, 0, 0);
    return new Date(d.getTime() + offsetDays * day);
  };

  window.DEMO = {
    user: { id: 'demo', displayName: 'Familie Muster', putzdienst: at(9) },

    events: [
      { title: 'Laternenumzug', start: at(2, 17, 0), end: at(2, 18, 30), location: 'Treffpunkt Bauwagen' },
      { title: 'Elternabend', start: at(6, 20, 0), end: at(6, 21, 30), location: 'Pfarrsaal' },
      { title: 'Putzdienst: Familie Muster', start: at(9), allDay: true },
      { title: 'Teamtag – Kita geschlossen', start: at(13), allDay: true, closed: true },
      { title: 'Arbeitswochenende', start: at(18, 9, 0), end: at(18, 15, 0), location: 'Gelände' },
      { title: 'Plätzchenbacken', start: at(30, 9, 0), end: at(30, 12, 0) },
      { title: 'Weihnachtsferien', start: at(55), end: at(68), allDay: true, closed: true },
    ],

    chats: [
      { token: 'gruppe', name: 'Kita-Gruppenchat', unread: 3, avatar: '🌳', messages: [
        { who: 'Team Bauwagen', text: 'Guten Morgen! Heute bitte Matschhosen mitgeben, es ist sehr nass im Wald.', t: at(0, 7, 42) },
        { who: 'Anna (Eltern)', text: 'Hat jemand eine blaue Mütze mit Bommel gefunden? 🙈', t: at(0, 9, 5) },
        { who: 'Team Bauwagen', text: 'Liegt in der Fundkiste am Bauwagen 👍', t: at(0, 9, 31) },
      ]},
      { token: 'team', name: 'Fragen an das Team', unread: 0, avatar: '🧑‍🏫', messages: [
        { who: 'Team Bauwagen', text: 'Danke für die Krankmeldung, gute Besserung!', t: at(-2, 8, 15) },
      ]},
      { token: 'vorstand', name: 'Elternbeirat', unread: 1, avatar: '🤝', messages: [
        { who: 'Beirat', text: 'Die Einladung zum Elternabend ist raus. Themen gerne bis Freitag hier sammeln.', t: at(-1, 19, 40) },
      ]},
    ],

    polls: [
      { id: 1, title: 'Termin für das Arbeitswochenende', description: 'Welcher Samstag passt euch? Mehrfachauswahl möglich.', multi: true, open: true, ends: at(5),
        options: [ { text: 'Sa, 14. November', votes: 11 }, { text: 'Sa, 21. November', votes: 7 }, { text: 'Sa, 28. November', votes: 4 } ] },
      { id: 2, title: 'Suppentag: Wer bringt was mit?', description: 'Bitte eine Option wählen.', multi: false, open: true, ends: at(12),
        options: [ { text: 'Kürbissuppe', votes: 5 }, { text: 'Kartoffelsuppe', votes: 6 }, { text: 'Brot & Butter', votes: 3 }, { text: 'Getränke', votes: 2 } ] },
      { id: 4, title: 'Laternenbasteln: Wann habt ihr Zeit?', description: 'Bitte alle Zeiten ankreuzen, die bei euch gehen.', isDate: true, allowMaybe: true, open: true, ends: at(6),
        options: [ { start: at(8, 15), end: at(8, 17), votes: 6, maybe: 2 }, { start: at(10, 15), end: at(10, 17), votes: 4, maybe: 1 }, { start: at(13, 9, 30), end: at(13, 11, 30), votes: 8, maybe: 0 } ] },
      { id: 3, title: 'Farbe der neuen Kita-Shirts', description: '', multi: false, open: false, ends: at(-10),
        options: [ { text: 'Waldgrün', votes: 19 }, { text: 'Orange', votes: 8 } ] },
    ],

    calendars: [
      { id: 'eltern', name: 'Elternkalender' },
      { id: 'privat', name: 'Persönlich' },
    ],

    // Ausgedachte Familien
    contacts: [
      { n: ['Kramer', 'Katrin'], name: 'Katrin Kramer', phones: [{ type: 'cell', value: '+49 151 0000001' }], emails: [{ type: 'home', value: 'katrin@example.test' }], addresses: [], note: 'Mama von Lotta (Füchse)', categories: ['Elternbeirat'] },
      { n: ['Huber', 'Jonas'], name: 'Jonas Huber', phones: [{ type: 'cell', value: '+49 151 0000002' }], emails: [], addresses: [{ type: 'home', value: 'Seestraße 4, 12345 Musterstadt' }], note: 'Papa von Emil (Eulen)' },
      { n: ['Brunner', 'Anna'], name: 'Anna Brunner', phones: [{ type: 'cell', value: '+49 151 0000003' }], emails: [], addresses: [], note: 'Mama von Mia und Ben' },
      { n: ['Pilz', ''], name: 'Familie Pilz', phones: [{ type: 'home', value: '08807 000004' }], emails: [{ type: '', value: 'pilz@example.test' }], addresses: [] },
      { n: ['Öztürk', 'Sophie'], name: 'Sophie Öztürk', phones: [{ type: 'cell', value: '+49 151 0000005' }], emails: [], addresses: [], note: 'Mama von Can (Füchse)' },
    ],

    pages: [
      { id: 'tagebuch', emoji: '📔', title: 'Kindergartentagebuch', teaser: 'Wöchentlicher Rückblick vom Team mit Fotos', updated: at(-1), body:
`# Kindergartentagebuch

## Diese Woche im Wald

Diese Woche stand ganz im Zeichen der **Laternen**. Die Kinder haben Transparentpapier geschnitten, geklebt und ihre Laternen mit getrockneten Blättern verziert.

Am Mittwoch haben wir am Bach einen Staudamm gebaut – mit großem Erfolg, bis der Regen kam.

> Nächste Woche: Bitte Laternen bis Montag zu Hause lassen, wir brauchen sie erst zum Umzug.

## Lied der Woche

*Ich geh mit meiner Laterne* – wir üben fleißig für den Umzug.` },
      { id: 'willkommen', emoji: '🌿', title: 'Willkommen in der KitaCloud', teaser: 'Zugänge, Kalender, Chat, Fotos', updated: at(-20), body:
`# Willkommen in der KitaCloud

Diese KiTa-App bündelt alles Wichtige für Eltern:

- **Termine** aus dem Kita-Kalender
- **Chat** mit dem Team und anderen Eltern
- **Fotos** aus dem Kita-Alltag
- **Umfragen** und das **Elternhandbuch**

Ihr meldet euch einmal mit eurem KitaCloud-Konto an.` },
      { id: 'jahr', emoji: '🗓️', title: 'Jahresüberblick & Termine', teaser: 'Schließtage und Termine 2026/2027', updated: at(-40), body:
`# Jahresüberblick 2026/2027

## Schließtage

- Teamtage laut Kalender
- Weihnachtsferien
- Brückentage nach Absprache

Alle Termine stehen auch im Reiter **Termine**.` },
      { id: 'putz', emoji: '🧹', title: 'Putzdienst – Aufgaben', teaser: 'Checkliste für den Bauwagen-Putzdienst', updated: at(-60), body:
`# Putzdienst – Aufgaben

1. Boden fegen und wischen
2. Tische abwischen
3. Handtücher mitnehmen und gewaschen zurückbringen
4. Müll leeren

Danke fürs Mitmachen! 💚` },
      { id: 'aemter', emoji: '🧺', title: 'Elternjobs – Ämter', teaser: 'Wer macht was im Kindergartenjahr', updated: at(-30), body:
`# Elternjobs – Ämter

Jede Familie übernimmt ein Amt. Die aktuelle Liste wird im Herbst beim Elternabend verteilt.` },
    ],
  };
})();
