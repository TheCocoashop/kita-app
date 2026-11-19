// Datenzugriff. Die Ansichten in app.js kennen nur das Objekt `api`.
//
// Läuft die Seite als Nextcloud-App, setzt das Template <body data-config="…">
// und wir sprechen direkt mit der KitaCloud (gleiche Domain, gleiches Login):
//   Termine   -> CalDAV       remote.php/dav/calendars/{uid}/
//   Kontakte  -> CardDAV      remote.php/dav/addressbooks/users/{uid}/
//   Chat      -> Talk         ocs/v2.php/apps/spreed/api/…
//   Umfragen  -> Polls        index.php/apps/polls/api/v1.0/…
//   Handbuch  -> Collectives  ocs/v2.php/apps/collectives/api/v1.0/… + WebDAV
// Ohne data-config (lokal geöffnete index.html) gibt es Demo-Daten aus demo-data.js.
const api = (() => {
  const cfgAttr = document.body.dataset.config;
  return cfgAttr ? nextcloudApi(JSON.parse(cfgAttr)) : demoApi(window.DEMO);
})();

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

// Einheitliche Kontaktform für beide Quellen; sortiert wird nach Nachname
// Familienkarten haben zwei Nummern und zwei Adressen, in derselben Reihenfolge wie die Namen
// in der Notiz („Eltern: Emma Kubitza; Bastian Kubitza“). Daraus ergibt sich, wer wen erreicht.
function parentFirstNames(note) {
  const m = (note || '').match(/Eltern:\s*([\s\S]*?)(?:\s*Kinder:|\n|$)/);
  if (!m) return [];
  return m[1].split(/\s*[;\\]+\s*/).map((n) => n.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0]).filter(Boolean);
}
function labelled(list, names) {
  return names.length >= 2 && list.length === names.length ? list.map((x, i) => ({ ...x, label: names[i] })) : list;
}

function toContact(c, i) {
  const [family = '', given = ''] = c.n || [];
  const names = parentFirstNames(c.note);
  const name = c.name || [given, family].filter(Boolean).join(' ');
  const sortName = (family || name).trim() + ' ' + given;
  return {
    id: String(c.uid || i),
    name,
    sortName,
    letter: (sortName.trim()[0] || '#').toLocaleUpperCase('de').replace(/[ÄÖÜ]/, (x) => ({ Ä: 'A', Ö: 'O', Ü: 'U' })[x]),
    org: c.org || '', note: c.note || '', categories: c.categories || [],
    phones: labelled(c.phones || [], names), emails: labelled(c.emails || [], names), addresses: c.addresses || [],
  };
}

// ======================================================================
// Demo
// ======================================================================
function demoApi(D) {
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 120));
  // Demo-Nachrichten bekommen Nummern und Reaktionen (nur im Speicher)
  const demoChat = (c) => {
    c.messages.forEach((m, i) => { if (m.id === undefined) { m.id = i + 1; m.reactions = m.reactions || {}; m.mine = m.mine || []; } });
    return c;
  };
  const summary = (c) => ({ token: c.token, name: c.name, unread: c.unread, avatar: c.avatar, last: c.messages[c.messages.length - 1] });

  return {
    demo: true,
    org: { name: 'Demo-Kindergarten', mailIt: '', photoHost: '' },
    webroot: '',
    monthView: true,
    me: () => wait(D.user),
    upcomingEvents: (limit) => wait(D.events.filter((e) => (e.end || e.start) >= startOfToday()).slice(0, limit)),
    monthEvents: () => wait(D.events),
    chats: () => wait(D.chats.map(summary)),
    chat: (token) => wait(demoChat(D.chats.find((c) => c.token === token))),
    sendMessage: (token, text) => {
      const c = D.chats.find((c) => c.token === token);
      c.messages.push({ who: D.user.displayName, text, t: new Date(), me: true });
      return wait(demoChat(c).messages);
    },
    react: (token, id, emoji, on) => {
      const c = demoChat(D.chats.find((c) => c.token === token));
      const m = c.messages.find((x) => x.id === id);
      const mine = m.mine.filter((e) => e !== emoji).concat(on ? [emoji] : []);
      m.reactions = { ...m.reactions }; m.mine = mine;
      m.reactions[emoji] = Math.max(0, (m.reactions[emoji] || 0) + (on ? 1 : -1));
      if (!m.reactions[emoji]) delete m.reactions[emoji];
      return wait(c.messages);
    },
    markRead: (token) => { D.chats.find((c) => c.token === token).unread = 0; return wait(); },
    polls: () => wait(D.polls.map(demoPoll)),
    poll: (id) => wait(demoPoll(D.polls.find((p) => String(p.id) === String(id)))),
    vote: (id, idx) => {
      const p = D.polls.find((p) => String(p.id) === String(id));
      p.mine = p.mine || [];
      const has = p.mine.includes(idx);
      if (!p.multi) {
        p.mine.forEach((i) => p.options[i].votes--);
        p.mine = [];
      } else if (has) {
        p.options[idx].votes--;
        p.mine = p.mine.filter((i) => i !== idx);
        return wait(demoPoll(p));
      }
      if (!has || p.multi) { p.options[idx].votes++; p.mine.push(idx); }
      return wait(demoPoll(p));
    },
    answer: (id, idx, answer) => {
      const p = D.polls.find((p) => String(p.id) === String(id));
      const o = p.options[idx];
      if (o.myAnswer === 'yes') o.votes--;
      if (o.myAnswer === 'maybe') o.maybe--;
      o.myAnswer = answer;
      if (answer === 'yes') o.votes++;
      if (answer === 'maybe') o.maybe = (o.maybe || 0) + 1;
      return wait(demoPoll(p));
    },
    calendars: () => wait(D.calendars),
    addEvent: (ev) => {
      D.events.push({ title: ev.title, start: ev.start, end: ev.end, allDay: ev.allDay, location: ev.location });
      D.events.sort((a, b) => a.start - b.start);
      return wait();
    },
    updateEvent: () => Promise.reject(new Error('Im Demo-Modus nicht verfügbar')),
    addOption: (id, text, voteYes) => {
      const p = D.polls.find((p) => String(p.id) === String(id));
      p.options.push({ text, votes: 1 });
      p.mine = [...(p.mine || []), p.options.length - 1];
      return wait(demoPoll(p));
    },
    createPoll: ({ title, description, options, multi, ends, dates, allowMaybe, allowProposals }) => {
      const id = Math.max(0, ...D.polls.map((p) => p.id)) + 1;
      D.polls.unshift(dates
        ? { id, title, description, isDate: true, allowMaybe, open: true, ends, options: dates.map((d) => ({ start: d.start, end: d.end, votes: 0, maybe: 0 })) }
        : { id, title, description, multi, allowProposals, open: true, ends, options: options.map((text) => ({ text, votes: 0 })) });
      return wait(id);
    },
    contacts: () => wait(D.contacts.map(toContact)),
    pages: () => wait(D.pages),
    allPages: () => wait(D.pages.map((p) => ({ id: p.id, title: p.title }))),
    searchPages: () => wait(D.pages.map((p) => ({ id: p.id, title: p.title, body: p.body || '' }))),
    page: (id) => wait(D.pages.find((p) => p.id === id)),
    tagebuch: () => wait(D.pages.find((p) => p.id === 'tagebuch')),
    ankList: () => wait({ canPost: false, items: [] }),
    ankSave: () => Promise.reject(new Error('Im Demo-Modus nicht verfügbar')),
    ankDelete: () => Promise.reject(new Error('Im Demo-Modus nicht verfügbar')),
    diary: () => wait({ canWrite: false }),
    diaryPhotos: () => wait({ cover: '', photos: [] }),
    diaryPhotoUrl: () => '',
    putz: () => wait({ family: null, current: null, duties: [], incoming: [], outgoing: [], recent: [] }),
    absence: () => wait({ enabled: false }),
    absenceCheck: () => Promise.reject(new Error('Im Demo-Modus nicht verfügbar')),
    absenceReport: () => Promise.reject(new Error('Im Demo-Modus nicht verfügbar')),
    absenceCancel: () => Promise.reject(new Error('Im Demo-Modus nicht verfügbar')),
    putzSwap: () => Promise.reject(new Error('Im Demo-Modus nicht verfügbar')),
    putzRespond: () => Promise.reject(new Error('Im Demo-Modus nicht verfügbar')),
    pageImage: (page, src) => src,
  };
}

// Zeitvorschlag einer Terminumfrage als Text, z. B. „Mi., 18. November, 15:00–17:00 Uhr“
function fmtPollRange(start, end) {
  const midnight = (d) => d.getHours() === 0 && d.getMinutes() === 0;
  const day = (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
  const time = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (midnight(start) && (!end || midnight(end))) {
    const last = end && new Date(end - 86400000);
    return last && last.toDateString() !== start.toDateString() ? `${day(start)} – ${day(last)}` : day(start);
  }
  if (!end) return `${day(start)}, ${time(start)} Uhr`;
  return end.toDateString() === start.toDateString()
    ? `${day(start)}, ${time(start)}–${time(end)} Uhr`
    : `${day(start)}, ${time(start)} – ${day(end)}, ${time(end)} Uhr`;
}

// Demo-Umfragen in dieselbe Form bringen wie die echten (Terminumfragen: Text aus Datum)
function demoPoll(p) {
  if (!p) return p;
  p.mine = p.mine || [];
  if (p.isDate) p.options.forEach((o) => { o.text = fmtPollRange(o.start, o.end); o.myAnswer = o.myAnswer || ''; });
  return { ...p, multi: p.isDate || p.multi, voted: p.isDate ? p.options.some((o) => o.myAnswer) : p.mine.length > 0 };
}

// ======================================================================
// Nextcloud
// ======================================================================
function nextcloudApi(cfg) {
  // cfg: { uid, displayName, requesttoken, webroot, collective, calendar, addressbook, chatToken }
  const base = cfg.webroot || '';
  const davCal = `${base}/remote.php/dav/calendars/${encodeURIComponent(cfg.uid)}/`;
  const davBooks = `${base}/remote.php/dav/addressbooks/users/${encodeURIComponent(cfg.uid)}/`;
  const davFiles = `${base}/remote.php/dav/files/${encodeURIComponent(cfg.uid)}`;
  const ocs = (p) => `${base}/ocs/v2.php${p}${p.includes('?') ? '&' : '?'}format=json`;
  // Polls ab Version 8/9 über OCS, ältere Versionen über index.php
  async function polls(path, opts) {
    try {
      return await ocsData(ocs(`/apps/polls/api/v1.0${path}`), opts);
    } catch (e) {
      if (!/^(404|405) /.test(e.message)) throw e;
      return json(`${base}/index.php/apps/polls/api/v1.0${path}`, opts);
    }
  }

  async function req(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...opts,
      headers: {
        requesttoken: cfg.requesttoken,
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        ...(opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
    });
    // Sitzung abgelaufen (401) oder Sicherheitstoken veraltet (412): einmal neu laden,
    // Nextcloud leitet dann bei Bedarf zum Login. Die Sperre verhindert eine Neulade-Schleife.
    if (res.status === 401 || res.status === 412) {
      let last = 0;
      try { last = Number(sessionStorage.getItem('kita-reload') || 0); } catch (e) { /* egal */ }
      if (Date.now() - last > 60000) {
        try { sessionStorage.setItem('kita-reload', String(Date.now())); } catch (e) { /* egal */ }
        location.reload();
      }
      throw new Error('Nicht angemeldet');
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
  }
  const json = async (url, opts) => (await req(url, opts)).json();
  // Wie req(), aber die lesbare Fehlermeldung des Servers bleibt erhalten
  const putzCall = (path, body) => kitaCall('POST', `putz/${path}`, body);
  async function kitaCall(method, path, body) {
    const res = await fetch(`${base}/index.php/apps/kitaapp/api/${path}`, {
      method, credentials: 'same-origin',
      headers: { requesttoken: cfg.requesttoken, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Das hat leider nicht geklappt. Bitte später noch einmal versuchen.');
    return data;
  }
  const ocsData = async (url, opts) => (await json(url, opts)).ocs.data;
  const encPath = (p) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');

  // ---------------- Termine (CalDAV) ----------------
  let eventsCache = null;
  function allEvents() {
    if (!eventsCache) eventsCache = loadEvents().catch((e) => { eventsCache = null; throw e; });
    return eventsCache;
  }

  const xmlDoc = (text) => new DOMParser().parseFromString(text, 'application/xml');
  const davProps = (depthOneUrl, props) => req(depthOneUrl, {
    method: 'PROPFIND',
    headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8', Accept: 'application/xml' },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:oc="http://owncloud.org/ns"><d:prop>${props}</d:prop></d:propfind>`,
  }).then((r) => r.text()).then(xmlDoc);
  const firstText = (el, ns, tag) => el.getElementsByTagNameNS(ns, tag)[0]?.textContent || '';

  let calendarsCache = null;
  function loadCalendars() {
    if (!calendarsCache) calendarsCache = davProps(davCal, '<d:displayname/><d:resourcetype/><d:current-user-privilege-set/><oc:owner-principal/>')
      .then((doc) => [...doc.getElementsByTagNameNS('DAV:', 'response')]
        .map((r) => {
          const own = firstText(r, 'http://owncloud.org/ns', 'owner-principal').endsWith('/' + cfg.uid);
          const name = firstText(r, 'DAV:', 'displayname');
          return {
            href: firstText(r, 'DAV:', 'href'),
            // Geteilte Kalender heißen „Elternkalender (Besitzer)“ – der Besitzer interessiert hier nicht
            name: own ? name : name.replace(/\s*\([^)]*\)$/, ''),
            own,
            writable: r.getElementsByTagNameNS('DAV:', 'write-content').length > 0,
            isCal: r.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav', 'calendar').length > 0,
          };
        })
        .filter((c) => c.isCal && c.href && !/contact_birthdays|trashbin|inbox|outbox/.test(c.href)))
      .catch((e) => { calendarsCache = null; throw e; });
    return calendarsCache;
  }

  async function loadEvents() {
    const calendars = await loadCalendars();

    // ab dem 1. des Vormonats, damit die Monatsansicht auch vergangene Tage zeigt
    const t0 = startOfToday();
    const from = new Date(t0.getFullYear(), t0.getMonth() - 1, 1);
    const to = new Date(t0.getTime() + 200 * 864e5);
    const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const body = `<?xml version="1.0"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data><c:expand start="${utc(from)}" end="${utc(to)}"/></c:calendar-data></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${utc(from)}" end="${utc(to)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;

    const perCal = await Promise.all(calendars.map(async (cal) => {
      try {
        const xml = await (await req(cal.href, {
          method: 'REPORT',
          headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8', Accept: 'application/xml' },
          body,
        })).text();
        const d = new DOMParser().parseFromString(xml, 'application/xml');
        return [...d.getElementsByTagNameNS('DAV:', 'response')].flatMap((r) => {
          const href = firstText(r, 'DAV:', 'href');
          return [...r.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav', 'calendar-data')]
            .flatMap((n) => parseIcs(n.textContent))
            .map((e) => ({ ...e, href, own: cal.own, canEdit: cal.writable && !e.recurring && !/putz/i.test(cal.name), calendar: cal.name, putz: /putz/i.test(cal.name) }));
        });
      } catch (e) {
        console.warn('Kalender nicht lesbar', cal.name, e);
        return [];
      }
    }));

    // Im Putzdienst-Kalender stehen alle Familien; wir zeigen nur die eigene.
    // Wer zu einem Termin eingeladen wird, bekommt ihn zusätzlich als Kopie im eigenen Kalender
    // („Personal“). Gleiche UID + gleicher Beginn = derselbe Termin, nur einmal zeigen
    // (die Kopie mit Beschreibung bzw. aus dem gemeinsamen Kalender gewinnt).
    const seen = new Map();
    const out = [];
    for (const e of perCal.flat()) {
      if (e.putz && !isMyFamily(e.title)) continue;
      if ((e.end || e.start) < from) continue;
      const key = e.uid ? `${e.uid}|${e.start.getTime()}` : null;
      const prev = key && seen.get(key);
      if (prev) {
        if (!prev.description && e.description) prev.description = e.description;
        if (!prev.location && e.location) prev.location = e.location;
        if (e.canEdit && (!prev.canEdit || (prev.own && !e.own))) Object.assign(prev, { href: e.href, own: e.own, canEdit: true });
        continue;
      }
      if (key) seen.set(key, e);
      out.push(e);
    }
    return out.sort((a, b) => a.start - b.start);
  }

  // "Putzdienst: Muster …" -> passt, wenn "Muster" im Anzeigenamen vorkommt
  function isMyFamily(title) {
    const m = title.match(/putzdienst\s*:\s*([^\s,(–-]+)/i);
    if (!m) return false;
    // Die Familie kommt vom Server (über die E-Mail-Adresse); der Anzeigename ist nur die Ersatzlösung
    return cfg.family ? cfg.family.toLowerCase() === m[1].toLowerCase() : cfg.displayName.toLowerCase().includes(m[1].toLowerCase());
  }

  function parseIcs(text) {
    const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const events = [];
    let ev = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
      if (line === 'END:VEVENT') { if (ev) events.push(ev); ev = null; continue; }
      if (!ev) continue;
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (!m) continue;
      const [, key, params, value] = m;
      if (key === 'SUMMARY') ev.SUMMARY = unescapeIcs(value);
      else if (key === 'UID') ev.UID = value;
      else if (key === 'DESCRIPTION') ev.DESCRIPTION = unescapeIcs(value);
      else if (key === 'LOCATION') ev.LOCATION = unescapeIcs(value);
      else if (key === 'DTSTART' || key === 'DTEND') ev[key] = { value, allDay: /VALUE=DATE(;|$)/.test(params) || /^\d{8}$/.test(value) };
      else if (key === 'STATUS') ev.STATUS = value;
      else if (key === 'RECURRENCE-ID' || key === 'RRULE') ev.recurring = true;
    }
    return events.filter((e) => e.DTSTART && e.STATUS !== 'CANCELLED').map((e) => {
      const allDay = e.DTSTART.allDay;
      const start = icsDate(e.DTSTART.value);
      let end = e.DTEND ? icsDate(e.DTEND.value) : null;
      if (allDay && end) {
        end = new Date(end.getTime() - 864e5); // DTEND ist bei ganztägigen Terminen exklusiv
        if (end <= start) end = null;
      }
      const title = e.SUMMARY || '(ohne Titel)';
      return { uid: e.UID, title, start, end, allDay, location: e.LOCATION, description: (e.DESCRIPTION || '').trim(), closed: /geschlossen|schließ|ferien/i.test(title), recurring: Boolean(e.recurring) };
    });
  }
  function icsDate(v) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
    if (!m) return new Date(v);
    const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
    return z ? new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)) : new Date(+y, mo - 1, +d, +h, +mi, +s);
  }
  function unescapeIcs(s) { return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }
  const escapeIcs = (s) => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');

  function buildIcs(ev, uid) {
    const pad = (n) => String(n).padStart(2, '0');
    const day = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KiTa-App//DE', 'BEGIN:VEVENT',
      `UID:${uid}`, `DTSTAMP:${utc(new Date())}`, `SUMMARY:${escapeIcs(ev.title)}`];
    if (ev.allDay) {
      const end = new Date(ev.end || ev.start);
      end.setDate(end.getDate() + 1); // DTEND ist bei ganztägigen Terminen exklusiv
      lines.push(`DTSTART;VALUE=DATE:${day(ev.start)}`, `DTEND;VALUE=DATE:${day(end)}`);
    } else {
      lines.push(`DTSTART:${utc(ev.start)}`, `DTEND:${utc(ev.end || new Date(ev.start.getTime() + 3600e3))}`);
    }
    if (ev.location) lines.push(`LOCATION:${escapeIcs(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // Bestehenden Termin ändern: die .ics-Datei holen, nur Titel/Zeit/Ort/Beschreibung ersetzen
  // (Einladungen, Erinnerungen und Zeitzone bleiben erhalten) und mit If-Match zurückschreiben.
  function patchIcs(text, ev) {
    const logical = [];
    for (const l of text.replace(/\r?\n/g, '\n').split('\n')) {
      if (/^[ \t]/.test(l) && logical.length) logical[logical.length - 1] += '\n' + l;
      else logical.push(l);
    }
    if (logical.filter((l) => l === 'BEGIN:VEVENT').length !== 1) throw new Error('Serientermine bitte in der KitaCloud ändern.');
    const key = (l) => (l.match(/^([A-Z-]+)[;:]/) || [])[1];
    const body = logical.slice(logical.indexOf('BEGIN:VEVENT'), logical.indexOf('END:VEVENT'));
    const old = body.find((l) => key(l) === 'DTSTART') || '';
    const tz = (old.match(/^DTSTART;[^:]*TZID=([^;:]+)/) || [])[1];
    const pad = (n) => String(n).padStart(2, '0');
    const day = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const inTz = (d) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).map((x) => [x.type, x.value]));
      return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
    };
    const time = (name, d) => (tz ? `${name};TZID=${tz}:${inTz(d)}` : `${name}:${stamp(d)}`);
    const seq = (Number((body.find((l) => key(l) === 'SEQUENCE') || '').split(':')[1]) || 0) + 1;
    const drop = new Set(['SUMMARY', 'LOCATION', 'DESCRIPTION', 'DTSTART', 'DTEND', 'DURATION', 'SEQUENCE', 'LAST-MODIFIED', 'DTSTAMP']);
    const add = [`SUMMARY:${escapeIcs(ev.title)}`, `SEQUENCE:${seq}`, `DTSTAMP:${stamp(new Date())}`, `LAST-MODIFIED:${stamp(new Date())}`];
    if (ev.allDay) {
      const end = new Date(ev.end || ev.start);
      end.setDate(end.getDate() + 1);
      add.push(`DTSTART;VALUE=DATE:${day(ev.start)}`, `DTEND;VALUE=DATE:${day(end)}`);
    } else {
      add.push(time('DTSTART', ev.start), time('DTEND', ev.end || new Date(ev.start.getTime() + 3600e3)));
    }
    if (ev.location) add.push(`LOCATION:${escapeIcs(ev.location)}`);
    if (ev.description) add.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
    const out = [];
    let inEvent = false, depth = 0, inserted = false;
    for (const l of logical) {
      if (l === 'BEGIN:VEVENT') { inEvent = true; out.push(l); continue; }
      if (inEvent && depth === 0 && (l.startsWith('BEGIN:') || l === 'END:VEVENT') && !inserted) { out.push(...add); inserted = true; }
      if (l === 'END:VEVENT') { inEvent = false; out.push(l); continue; }
      if (inEvent && l.startsWith('BEGIN:')) depth++;
      if (inEvent && l.startsWith('END:')) depth--;
      if (inEvent && depth === 0 && drop.has(key(l))) continue;
      out.push(l);
    }
    return out.join('\r\n').replace(/(\r\n)*$/, '\r\n').replace(/\n(?=[ \t])/g, '\r\n');
  }

  // ---------------- Kontakte (CardDAV) ----------------
  function parseVcards(text) {
    const cards = [];
    let c = null;
    for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
      if (/^BEGIN:VCARD$/i.test(line)) { c = { phones: [], emails: [], addresses: [] }; continue; }
      if (/^END:VCARD$/i.test(line)) { if (c) cards.push(c); c = null; continue; }
      if (!c) continue;
      const m = line.match(/^(?:[\w-]+\.)?([A-Z-]+)((?:;[^:]*)?):(.*)$/i);
      if (!m) continue;
      const key = m[1].toUpperCase(), params = m[2], value = unescapeIcs(m[3]);
      const type = (params.match(/TYPE=([^;:]+)/i)?.[1] || '').toLowerCase();
      if (key === 'UID') c.uid = value;
      else if (key === 'FN') c.name = value;
      else if (key === 'N') c.n = m[3].split(';').map(unescapeIcs);
      else if (key === 'TEL') c.phones.push({ type, value: value.replace(/^tel:/i, '') });
      else if (key === 'EMAIL') c.emails.push({ type, value });
      else if (key === 'ADR') {
        const [, , street, city, , zip] = m[3].split(';').map(unescapeIcs);
        const addr = [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        if (addr) c.addresses.push({ type, value: addr });
      }
      else if (key === 'ORG') c.org = value.replace(/;+$/, '');
      else if (key === 'NOTE') c.note = value;
      else if (key === 'CATEGORIES') c.categories = value.split(',').filter(Boolean);
    }
    return cards;
  }

  // ---------------- Chat (Talk) ----------------
  const avatarUrl = (token) => `${base}/ocs/v2.php/apps/spreed/api/v1/room/${encodeURIComponent(token)}/avatar`;

  function talkText(msg) {
    const params = msg.messageParameters || {};
    return (msg.message || '').replace(/\{([a-z0-9-]+)\}/gi, (all, k) => {
      const p = params[k];
      if (!p) return all;
      return p.type === 'user' || p.type === 'guest' || p.type === 'call' ? '@' + p.name : (p.name || all);
    });
  }
  function toMessage(m) {
    return {
      id: m.id,
      who: m.actorDisplayName || 'Gast',
      text: talkText(m),
      t: new Date(m.timestamp * 1000),
      me: m.actorType === 'users' && m.actorId === cfg.uid,
      reactions: m.reactions || {},
      mine: m.reactionsSelf || [],
    };
  }

  // ---------------- Umfragen (Polls) ----------------
  // Die Polls-App hat ihr Datenformat mehrfach geändert, daher wird defensiv gelesen.
  function normalizePoll(p, options) {
    const c = p.configuration || p;
    const expire = Number(c.expire || 0);
    const expired = p.status?.isExpired ?? p.expired ?? (expire > 0 && expire * 1000 < Date.now());
    const archived = p.status?.isArchived || p.deleted || c.deleted;
    const maxVotes = Number(c.maxVotesPerUser ?? c.voteLimit ?? 0);
    const isDate = (p.type || c.type) === 'datePoll';
    const opts = (options || []).map((o) => ({
      id: o.id,
      text: isDate && o.timestamp ? fmtPollRange(new Date(o.timestamp * 1000), o.duration ? new Date((o.timestamp + o.duration) * 1000) : null) : (o.text || ''),
      votes: Number(o.votes?.yes ?? o.yes ?? 0),
      maybe: Number(o.votes?.maybe ?? o.maybe ?? 0),
      myAnswer: o.votes?.currentUser || '',
    }));
    return {
      id: p.id,
      title: c.title || p.title || 'Umfrage',
      description: c.description || '',
      isDate,
      allowMaybe: Boolean(c.allowMaybe),
      allowProposals: c.allowProposals === 'allow',
      multi: isDate || maxVotes !== 1,
      // Die Liste kommt ohne Optionen, dort steht die Zahl der eigenen Stimmen im Status
      voted: options ? opts.some((o) => o.myAnswer) : Number(p.currentUserStatus?.countVotes ?? 0) > 0,
      open: !expired && !archived,
      archived,
      ends: expire > 0 ? new Date(expire * 1000) : null,
      options: opts,
      mine: opts.map((o, i) => (o.myAnswer === 'yes' ? i : -1)).filter((i) => i >= 0),
    };
  }
  async function loadOptions(id) {
    const data = await polls(`/poll/${id}/options`);
    const options = data.options || [];
    // Ältere Polls-Versionen liefern die eigene Stimme nicht mit den Optionen
    if (options.length && options[0].votes?.currentUser === undefined) {
      try {
        const v = await polls(`/poll/${id}/votes`);
        const mine = (v.votes || []).filter((x) => (x.user?.userId ?? x.userId) === cfg.uid && (x.answer ?? x.voteAnswer) === 'yes');
        options.forEach((o) => {
          o.votes = o.votes || {};
          o.votes.currentUser = mine.some((x) => (x.optionId ?? x.option?.id) === o.id || (x.optionText ?? x.voteOptionText) === o.text) ? 'yes' : '';
        });
      } catch (e) { /* ohne eigene Stimmen weiter */ }
    }
    return options;
  }
  async function setVote(optionId, setTo) {
    try {
      await polls(`/option/${optionId}/vote/${setTo}`, { method: 'PUT' });
    } catch (e) {
      // ältere Polls-Versionen
      await polls(`/option/${optionId}/vote`, { method: 'PUT', body: JSON.stringify({ setTo }) });
    }
  }

  // ---------------- Handbuch (Collectives) ----------------
  let pagesCache = null;
  let searchCache = null;
  function loadPages() {
    if (!pagesCache) pagesCache = (async () => {
      let collectives;
      try {
        collectives = (await ocsData(ocs('/apps/collectives/api/v1.0/collectives'))).collectives;
      } catch (e) {
        collectives = (await json(`${base}/index.php/apps/collectives/_api`)).data;
      }
      const want = (cfg.collective || 'Elternhandbuch').toLowerCase();
      const coll = collectives.find((c) => c.name.toLowerCase() === want) || collectives.find((c) => c.name.toLowerCase().includes('eltern')) || collectives[0];
      if (!coll) return { coll: null, pages: [] };
      let pages;
      try {
        pages = (await ocsData(ocs(`/apps/collectives/api/v1.0/collectives/${coll.id}/pages`))).pages;
      } catch (e) {
        pages = (await json(`${base}/index.php/apps/collectives/_api/${coll.id}/_pages`)).data;
      }
      return { coll, pages };
    })().catch((e) => { pagesCache = null; throw e; });
    return pagesCache;
  }
  const pageDir = (p, coll) => [p.collectivePath || `Kollektive/${coll.name}`, p.filePath].filter(Boolean).join('/');
  function toPage(p, coll) {
    return {
      id: String(p.id),
      emoji: p.emoji || '📄',
      title: p.title,
      teaser: p.lastUserDisplayName ? `zuletzt bearbeitet von ${p.lastUserDisplayName}` : '',
      updated: p.timestamp ? new Date(p.timestamp * 1000) : null,
      dir: pageDir(p, coll),
      fileName: p.fileName,
    };
  }
  async function pageWithBody(raw, coll) {
    const page = toPage(raw, coll);
    const res = await req(`${davFiles}/${encPath(page.dir + '/' + page.fileName)}`, { headers: { Accept: 'text/markdown, text/plain, */*' } });
    page.body = await res.text();
    return page;
  }

  return {
    demo: false,
    org: cfg.org || { name: '', mailIt: '', photoHost: '' },
    webroot: base,
    monthView: !!cfg.monthView,

    async me() {
      const events = (await allEvents().catch(() => [])).filter((e) => (e.end || e.start) >= startOfToday());
      const putz = events.find((e) => e.putz);
      return { id: cfg.uid, displayName: cfg.displayName, putzdienst: putz ? putz.start : null };
    },
    async upcomingEvents(limit) { return (await allEvents()).filter((e) => (e.end || e.start) >= startOfToday()).slice(0, limit); },
    monthEvents: () => allEvents(),
    // Kalender, in die man selbst schreiben darf – Elternkalender zuerst, eigene zuletzt
    async calendars() {
      const want = (cfg.calendar || 'eltern').toLowerCase();
      return (await loadCalendars())
        .filter((c) => c.writable)
        .sort((a, b) => (b.name.toLowerCase().includes(want) - a.name.toLowerCase().includes(want)) || (a.own - b.own) || a.name.localeCompare(b.name, 'de'))
        .map((c) => ({ id: c.href, name: c.name }));
    },
    async updateEvent(href, ev) {
      const get = await req(href, { headers: { Accept: 'text/calendar' } });
      const etag = get.headers.get('ETag');
      const body = patchIcs(await get.text(), ev);
      await req(href, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...(etag ? { 'If-Match': etag } : {}) },
        body,
      });
      eventsCache = null;
    },
    async addEvent(ev) {
      const uid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + '-kitaapp';
      await req(`${ev.calendar.replace(/\/?$/, '/')}${uid}.ics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' },
        body: buildIcs(ev, uid),
      });
      eventsCache = null;
    },

    async contacts() {
      const doc = await davProps(davBooks, '<d:displayname/><d:resourcetype/>');
      let books = [...doc.getElementsByTagNameNS('DAV:', 'response')]
        .filter((r) => r.getElementsByTagNameNS('urn:ietf:params:xml:ns:carddav', 'addressbook').length)
        .map((r) => ({ href: firstText(r, 'DAV:', 'href'), name: firstText(r, 'DAV:', 'displayname') }))
        .filter((b) => !/\/z-(server|app)-generated--/.test(b.href)); // Nextcloud-Konten, „Zuletzt kontaktiert“
      // Gibt es ein Eltern-Adressbuch, nur dieses zeigen (nicht die privaten Kontakte)
      const want = (cfg.addressbook || 'eltern').toLowerCase();
      const preferred = books.filter((b) => b.name.toLowerCase().includes(want) || b.href.toLowerCase().includes(want));
      if (preferred.length) books = preferred;
      const all = await Promise.all(books.map(async (b) => {
        const xml = xmlDoc(await (await req(b.href, {
          method: 'REPORT',
          headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8', Accept: 'application/xml' },
          body: '<?xml version="1.0"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><card:address-data/></d:prop></card:addressbook-query>',
        })).text());
        return [...xml.getElementsByTagNameNS('urn:ietf:params:xml:ns:carddav', 'address-data')].flatMap((n) => parseVcards(n.textContent));
      }));
      const seen = new Set();
      return all.flat()
        .filter((c) => c.name || c.n)
        .filter((c) => !c.uid || (!seen.has(c.uid) && seen.add(c.uid)))
        .map((c, i) => toContact(c, i));
    },

    async chats() {
      const rooms = await ocsData(ocs('/apps/spreed/api/v4/room'));
      return rooms
        // „Talk Aktualisierungen“, „Notiz an mich“ und die Beispiel-Unterhaltung „Los geht's!“ ausblenden
        .filter((r) => r.type !== 4 && r.type !== 6 && r.objectType !== 'sample' && r.objectType !== 'note_to_self')
        .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
        .map((r) => ({
          token: r.token,
          name: r.displayName,
          unread: r.unreadMessages || 0,
          avatarUrl: avatarUrl(r.token),
          last: r.lastMessage && r.lastMessage.message !== undefined ? toMessage(r.lastMessage) : null,
        }));
    },
    async chat(token) {
      const [room, msgs] = await Promise.all([
        ocsData(ocs(`/apps/spreed/api/v4/room/${encodeURIComponent(token)}`)),
        ocsData(ocs(`/apps/spreed/api/v1/chat/${encodeURIComponent(token)}?lookIntoFuture=0&limit=60&setReadMarker=1`)),
      ]);
      return {
        token,
        name: room.displayName,
        lastId: msgs.reduce((n, m) => Math.max(n, m.id), 0),
        messages: msgs.filter((m) => !m.systemMessage && m.messageType !== 'comment_deleted').reverse().map(toMessage),
      };
    },
    async sendMessage(token, text) {
      await req(ocs(`/apps/spreed/api/v1/chat/${encodeURIComponent(token)}`), { method: 'POST', body: JSON.stringify({ message: text }) });
      return (await this.chat(token)).messages;
    },
    // Emoji-Reaktion setzen (on = true) oder zurücknehmen
    async react(token, id, emoji, on) {
      await req(ocs(`/apps/spreed/api/v1/reaction/${encodeURIComponent(token)}/${id}`), { method: on ? 'POST' : 'DELETE', body: JSON.stringify({ reaction: emoji }) });
      return (await this.chat(token)).messages;
    },
    // „setReadMarker“ beim Laden wirkt bei Talk nur im Live-Modus; die Lesemarke muss ausdrücklich gesetzt werden
    async markRead(token, lastId) {
      if (!lastId) return;
      await req(ocs(`/apps/spreed/api/v1/chat/${encodeURIComponent(token)}/read`), { method: 'POST', body: JSON.stringify({ lastReadMessage: lastId }) }).catch(() => {});
    },

    async polls() {
      const data = await polls('/polls');
      const list = (data.polls || data || []).map((p) => normalizePoll(p, null));
      return list.filter((p) => !p.archived).sort((a, b) => (b.open - a.open) || ((a.ends || 0) - (b.ends || 0)));
    },
    async poll(id) {
      const [p, options] = await Promise.all([polls(`/poll/${id}`), loadOptions(id)]);
      return normalizePoll(p.poll || p, options);
    },
    async vote(id, idx) {
      const p = await this.poll(id);
      const opt = p.options[idx];
      const has = p.mine.includes(idx);
      if (!p.multi && !has) {
        for (const i of p.mine) await setVote(p.options[i].id, 'no');
      }
      await setVote(opt.id, has ? 'no' : 'yes');
      return this.poll(id);
    },
    async answer(id, idx, answer) {
      const p = await this.poll(id);
      await setVote(p.options[idx].id, answer);
      return this.poll(id);
    },
    // options: Texte, bei dates: [{ start: Date, end: Date }] (ganztägig: 0:00 bis 0:00 des Folgetags)
    async addOption(id, text, voteYes = true) {
      await polls(`/poll/${id}/option`, { method: 'POST', body: JSON.stringify({ option: { text }, voteYes }) });
      return this.poll(id);
    },
    async createPoll({ title, description, options, multi, ends, dates, allowMaybe, allowProposals }) {
      let created;
      try {
        created = await polls('/poll', { method: 'POST', body: JSON.stringify({ type: dates ? 'datePoll' : 'textPoll', title }) });
      } catch (e) {
        if (/^403 /.test(e.message)) throw new Error('Dein Konto darf keine Umfragen anlegen. Bitte beim Vorstand melden.');
        throw e;
      }
      const id = (created.poll || created).id;
      try {
        // „open“ = alle in der KitaCloud dürfen die Umfrage sehen und abstimmen
        await polls(`/poll/${id}`, { method: 'PUT', body: JSON.stringify({ pollConfiguration: {
          access: 'open', description, allowProposals: allowProposals ? 'allow' : 'disallow', maxVotesPerUser: multi || dates ? 0 : 1, allowMaybe: Boolean(allowMaybe),
          expire: ends ? Math.floor(ends.getTime() / 1000) : 0,
        } }) });
        if (dates) {
          for (const d of dates) {
            const option = { timestamp: Math.floor(d.start / 1000), duration: d.end ? Math.round((d.end - d.start) / 1000) : 0 };
            await polls(`/poll/${id}/option`, { method: 'POST', body: JSON.stringify({ option }) });
          }
        } else {
          await polls(`/poll/${id}/options`, { method: 'POST', body: JSON.stringify({ text: options.join('\n') }) });
        }
      } catch (e) {
        await polls(`/poll/${id}`, { method: 'DELETE' }).catch(() => {}); // keine halbfertige Umfrage stehen lassen
        throw e;
      }
      return id;
    },

    async pages() {
      const { coll, pages } = await loadPages();
      if (!coll) return [];
      const root = pages.find((p) => !p.parentId) || {};
      const children = pages.filter((p) => p.parentId && p.parentId === root.id && !/^ank[üu]ndigungen$/i.test(p.title.trim()));
      const order = root.subpageOrder || [];
      children.sort((a, b) => {
        const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.title.localeCompare(b.title, 'de');
      });
      return children.map((p) => toPage(p, coll));
    },
    async allPages() {
      const { coll, pages } = await loadPages();
      if (!coll) return [];
      const root = pages.find((p) => !p.parentId) || {};
      const byId = new Map(pages.map((p) => [p.id, p]));
      return pages.filter((p) => p.id !== root.id && !/^ank[üu]ndigungen$/i.test(p.title.trim())).map((p) => {
        const parent = byId.get(p.parentId);
        return { id: String(p.id), title: parent && parent.id !== root.id ? `${parent.title} › ${p.title}` : p.title };
      }).sort((a, b) => a.title.localeCompare(b.title, 'de'));
    },
    // Alle Seiten samt Text für die Suche (einmal laden, dann im Speicher)
    searchPages() {
      return (searchCache ||= (async () => {
        const { coll, pages } = await loadPages();
        if (!coll) return [];
        const root = pages.find((p) => !p.parentId) || {};
        const byId = new Map(pages.map((p) => [p.id, p]));
        const list = pages.filter((p) => p.id !== root.id && !/^ank[üu]ndigungen$/i.test(p.title.trim()));
        const out = [];
        let next = 0;
        const worker = async () => {
          while (next < list.length) {
            const p = list[next++];
            const parent = byId.get(p.parentId);
            const title = parent && parent.id !== root.id ? `${parent.title} › ${p.title}` : p.title;
            try { out.push({ id: String(p.id), title, body: (await pageWithBody(p, coll)).body }); } catch (e) { out.push({ id: String(p.id), title, body: '' }); }
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
        return out;
      })().catch((e) => { searchCache = null; throw e; }));
    },
    async page(id) {
      const { coll, pages } = await loadPages();
      const raw = pages.find((p) => String(p.id) === String(id));
      return raw ? pageWithBody(raw, coll) : null;
    },
    // Putzdienst-Tausch: Der Server prüft und schreibt in den Kalender, hier nur Anfragen und Antworten
    putz: () => json(`${base}/index.php/apps/kitaapp/api/putz`),
    putzSwap: (myUri, theirUri, message) => putzCall('swap', { myUri, theirUri, message }),
    putzRespond: (id, action) => putzCall(`swap/${encodeURIComponent(id)}/${action}`, {}),
    // Abwesenheit: Eltern melden ihr Kind, das Team sieht die Liste (Rechte prüft der Server)
    absence: () => json(`${base}/index.php/apps/kitaapp/api/absence`),
    absenceCheck: () => json(`${base}/index.php/apps/kitaapp/api/absence/check`),
    absenceReport: (data) => kitaCall('POST', 'absence', data),
    absenceCancel: (id) => kitaCall('POST', `absence/${id}/cancel`, {}),
    // Meldungen auf der Startseite (schreiben darf nur der Vorstand, das prüft der Server)
    ankList: () => json(`${base}/index.php/apps/kitaapp/api/ank`),
    ankSave: (id, data) => (id ? kitaCall('PUT', `ank/${id}`, data) : kitaCall('POST', 'ank', data)),
    ankDelete: (id) => kitaCall('DELETE', `ank/${id}`),
    diary: () => json(`${base}/index.php/apps/kitaapp/api/diary`),
    diaryDraft: (data) => kitaCall('PUT', 'diary/draft', data),
    diaryPublish: (data) => kitaCall('POST', 'diary/publish', data),
    diaryPhotos: (link) => json(`${base}/index.php/apps/kitaapp/api/diary/photos?link=${encodeURIComponent(link)}`),
    diaryPhotoUrl: (link, id) => `${base}/index.php/apps/kitaapp/api/diary/photo?link=${encodeURIComponent(link)}&id=${id}`,
    ankImage: (id, v) => `${base}/index.php/apps/kitaapp/api/ank/${id}/image?v=${v}`,
    async tagebuch() {
      const { coll, pages } = await loadPages();
      const raw = pages.find((p) => /tagebuch/i.test(p.title));
      return raw ? pageWithBody(raw, coll) : null;
    },
    // Bilder im Handbuch (z. B. .attachments.3132/IMG.jpeg) als verkleinerte Vorschau laden
    pageImage(page, src) {
      if (/^(https?:|data:)/.test(src)) return src;
      const path = '/' + [page.dir, decodeURIComponent(src)].join('/').split('/').filter(Boolean).join('/');
      return `${base}/index.php/core/preview.png?file=${encodeURIComponent(path)}&x=1200&y=1200&a=1`;
    },
  };
}
