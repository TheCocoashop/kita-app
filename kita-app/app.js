// Ansichten und Navigation (Hash-Routing: #/start, #/chat/gruppe, …)
const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $back = document.getElementById('back');

const routes = [
  [/^start$/, viewStart],
  [/^termine$/, viewTermine],
  [/^termine\/neu$/, viewNeuerTermin],
  [/^termine\/bearbeiten\/(.+)$/, viewTerminBearbeiten],
  [/^termine\/monat(?:\/(\d{4}-\d{2}))?$/, viewMonat],
  [/^chat$/, viewChats],
  [/^chat\/(.+)$/, viewChat],
  [/^umfragen$/, viewUmfragen],
  [/^umfragen\/neu$/, viewNeueUmfrage],
  [/^umfragen\/(.+)$/, viewUmfrage],
  [/^aktuell\/([a-f0-9]+)$/, viewAnkuendigung],
  [/^meldungen$/, viewMeldungen],
  [/^meldungen\/(neu|[a-f0-9]+)$/, viewMeldungForm],
  [/^putz$/, viewPutz],
  [/^suche$/, viewSuche],
  [/^abwesend$/, viewAbwesend],
  [/^abwesend\/pruefen$/, viewAbwesendPruefen],
  [/^rueckblick$/, viewRueckblick],
  [/^neu$/, viewNeu],
  [/^handbuch$/, viewHandbuch],
  [/^handbuch\/(.+)$/, viewSeite],
  [/^kontakte$/, viewKontakte],
  [/^kontakte\/(.+)$/, viewKontakt],
];

let refreshTimer = null; // Chat-Aktualisierung, wird bei jedem Seitenwechsel beendet

window.addEventListener('hashchange', render);
$back.addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/start')));
document.getElementById('demo-badge').hidden = !api.demo;
document.getElementById('search-btn').addEventListener('click', () => (location.hash = '#/suche'));
render();

async function render() {
  clearInterval(refreshTimer);
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'start';
  const tab = path.split('/')[0];
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (tab === 'umfragen' ? 'termine' : tab)));
  $back.hidden = !path.includes('/') && path !== 'suche';
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try {
        await fn(...m.slice(1));
      } catch (e) {
        console.error(e);
        show('Fehler', errorBox('Das konnte gerade nicht geladen werden.', e));
      }
      window.scrollTo(0, path.startsWith('chat/') ? document.body.scrollHeight : 0);
      return;
    }
  }
  location.hash = '#/start';
}

function show(title, html) {
  $title.textContent = title;
  $view.innerHTML = html;
}

function errorBox(text, err) {
  return `<div class="card highlight"><h3>⚠️ ${esc(text)}</h3>
    <div class="meta">Bitte später noch einmal versuchen.${err ? ` <span style="opacity:.6">(${esc(err.message || err)})</span>` : ''}</div></div>`;
}

// ---------- Start ----------
async function viewStart() {
  show('KiTa', '<p class="empty">Lädt …</p>');
  const [me, events, chats, polls, tagebuch, ankPage, putzState, diaryState, absenceState] = await Promise.allSettled([
    api.me(), api.upcomingEvents(3), api.chats(), api.polls(), api.tagebuch(), api.ankList(), api.putz(), api.diary(), api.absence(),
  ]);
  const val = (r, fallback) => (r.status === 'fulfilled' ? r.value : fallback);
  const user = val(me, { displayName: '' });
  const unreadChats = val(chats, []).filter((c) => c.unread);
  const unread = unreadChats.reduce((n, c) => n + c.unread, 0);
  const openPolls = val(polls, []).filter((p) => p.open && !p.voted);
  const tb = val(tagebuch, null);
  const ankState = val(ankPage, { items: [], canPost: false });
  const ank = ankState.items.filter((a) => a.active);
  const putzIncoming = val(putzState, { incoming: [] }).incoming;
  const putzCurrent = val(putzState, { current: null }).current;
  const canDiary = val(diaryState, { canWrite: false }).canWrite;
  const abs = val(absenceState, { enabled: false });
  const putzIn = user.putzdienst ? daysUntil(user.putzdienst) : null;

  show('KiTa', `
    <p class="greeting">${greeting()}${user.displayName ? ', ' + esc(user.displayName) : ''}</p>
    <p class="sub">${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>

    ${putzIncoming.map((s) => `
      <a class="card highlight" href="#/putz">
        <h3>🔁 Tauschanfrage von Familie ${esc(s.a.family)}</h3>
        <div class="meta">Ihr übernehmt ${esc(dutyLabel(s.a.date))}, ihr gebt ${esc(dutyLabel(s.b.date))} ab.</div>
        <span class="more">Antworten ›</span>
      </a>`).join('')}

    ${ank.map(ankuendigungCard).join('')}

    ${absenceCard(abs)}

    ${installCard()}

    ${whatsNewCard()}

    ${putzCurrent ? putzCard(putzCurrent) : ''}

    ${!putzCurrent && putzIn !== null && putzIn <= 14 ? `
      <a class="card highlight" href="#/termine">
        <h3>🧹 Ihr habt Putzdienst ${putzIn <= 0 ? 'diese Woche' : putzIn === 1 ? 'ab morgen' : `in ${putzIn} Tagen`}</h3>
        <div class="meta">ab ${fmtDate(user.putzdienst, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </a>
      <a class="more" href="#/putz" style="margin:-4px 0 10px">Tauschen ›</a>` : ''}

    ${unread ? `
      <a class="card green" href="${unreadChats.length === 1 ? '#/chat/' + encodeURIComponent(unreadChats[0].token) : '#/chat'}">
        <h3>💬 ${unread} neue Nachricht${unread > 1 ? 'en' : ''}</h3>
        <div class="meta ellipsis">${esc(newestLast(unreadChats))}</div>
      </a>` : ''}

    <h2 class="section">Nächste Termine</h2>
    ${events.status === 'rejected' ? errorBox('Termine nicht erreichbar', events.reason)
      : events.value.length ? `<div class="list">${events.value.map(eventRow).join('')}</div>` : '<p class="meta">Keine anstehenden Termine.</p>'}
    <a class="more" href="#/termine">Alle Termine ›</a>

    ${openPolls.length ? `
      <h2 class="section">Offene Umfragen</h2>
      <div class="list">${openPolls.slice(0, 3).map(pollRow).join('')}</div>
      <a class="more" href="#/umfragen">Alle Umfragen ›</a>` : ''}

    ${tb ? tagebuchCard(tb) : ''}

    ${canDiary ? '<a class="btn secondary add" href="#/rueckblick" style="margin-top:18px">📔 Wochenrückblick schreiben</a>' : ''}
    ${ankState.canPost ? `<a class="btn secondary add" href="#/meldungen" style="margin-top:${canDiary ? 8 : 18}px">📣 Meldungen für die Startseite</a>` : ''}
  `);
  bindInstallCard();
  bindWhatsNewCard();
}

// Karte „Euer Putzdienst“: nur für die Familie, die laut Kalender gerade dran ist
function putzCard(c) {
  const when = c.phase === 'soon' ? `ab ${fmtDate(new Date(c.date + 'T00:00:00'), { weekday: 'long', day: 'numeric', month: 'long' })}`
    : c.phase === 'week' ? `diese Woche, bis ${fmtDate(new Date(c.until + 'T00:00:00'), { weekday: 'long', day: 'numeric', month: 'long' })}`
    : 'Reinigungs- und Einkaufsdienst in dieser Woche';
  return `
    <div class="card highlight putz-card">
      <h3>🧹 Euer Putzdienst</h3>
      <div class="meta">${when}${c.putzmittel ? ` · Putzmittel: ${esc(c.putzmittel)}` : ''}</div>
      <div class="putz-actions">
        <a class="btn" href="${esc(c.tasksUrl)}" target="_blank" rel="noopener">📋 Aufgabenliste</a>
        <a class="btn secondary" href="${esc(c.checklistUrl)}" target="_blank" rel="noopener">✅ Abhaken</a>
      </div>
      <a class="more" href="#/putz">Dienst tauschen ›</a>
    </div>`;
}

// ---------- Putzdienst tauschen ----------
function dutyLabel(iso) { return 'ab ' + fmtDate(new Date(iso + 'T00:00:00'), { weekday: 'short', day: 'numeric', month: 'long' }); }

async function viewPutz() {
  show('Putzdienst tauschen', '<p class="empty">Lädt …</p>');
  await renderPutz(await api.putz());
}

async function renderPutz(st) {
  if (!st.family) {
    return show('Putzdienst tauschen', errorBox('Wir finden eure Familie nicht.', new Error(helpHint())));
  }
  const until = (ts) => fmtDate(new Date(ts * 1000), { weekday: 'short', day: 'numeric', month: 'long' }) + ', ' + fmtTime(new Date(ts * 1000));
  const mine = st.duties.filter((d) => d.mine && d.swappable && !d.busy);
  const others = st.duties.filter((d) => !d.mine && d.swappable && !d.busy);
  const radio = (name, d, label) => `<label class="row choose"><input type="radio" name="${name}" value="${esc(d.uri)}">
      <div class="grow"><div class="title">${esc(dutyLabel(d.date))}</div><div class="meta">${esc(label)}</div></div></label>`;

  show('Putzdienst tauschen', `
    <p class="meta">Ihr seid <b>Familie ${esc(st.family)}</b>. Getauscht wird erst, wenn die andere Familie zustimmt. Sprecht euch vorher am besten im Chat ab.</p>

    ${st.incoming.map((s) => `
      <div class="card highlight" data-id="${esc(s.id)}">
        <h3>🔁 Familie ${esc(s.a.family)} möchte tauschen</h3>
        <div class="meta">Ihr übernehmt <b>${esc(dutyLabel(s.a.date))}</b>.<br>Dafür gebt ihr <b>${esc(dutyLabel(s.b.date))}</b> ab.</div>
        ${s.message ? `<p>„${esc(s.message)}“</p>` : ''}
        <div class="actions"><button class="btn" data-act="accept">Tauschen</button><button class="btn secondary" data-act="decline">Ablehnen</button></div>
        <div class="meta">Anfrage gilt bis ${until(s.expires)}</div>
      </div>`).join('')}

    ${st.outgoing.map((s) => `
      <div class="card" data-id="${esc(s.id)}">
        <h3>⏳ Anfrage an Familie ${esc(s.b.family)}</h3>
        <div class="meta">Ihr gebt <b>${esc(dutyLabel(s.a.date))}</b> ab und übernehmt <b>${esc(dutyLabel(s.b.date))}</b>. Warten auf Antwort bis ${until(s.expires)}.</div>
        <div class="actions"><button class="btn secondary" data-act="cancel">Zurückziehen</button></div>
      </div>`).join('')}

    ${st.recent.map((s) => `
      <div class="card green" data-id="${esc(s.id)}">
        <h3>✅ Getauscht: Familie ${esc(s.a.family)} ⇄ Familie ${esc(s.b.family)}</h3>
        <div class="meta">${esc(s.a.family)}: ${esc(dutyLabel(s.b.date))} · ${esc(s.b.family)}: ${esc(dutyLabel(s.a.date))}</div>
        <div class="actions"><button class="btn secondary" data-act="undo">Rückgängig machen</button></div>
        <div class="meta">Möglich bis ${until(s.undoUntil)}</div>
      </div>`).join('')}

    <h2 class="section">Neue Anfrage</h2>
    ${!mine.length ? '<p class="meta">Ihr habt zurzeit keinen Dienst, den ihr tauschen könnt.</p>' : `
      <p class="meta">1. Welchen eurer Dienste gebt ihr ab?</p>
      <div class="list">${mine.map((d) => radio('mine', d, d.note || 'euer Dienst')).join('')}</div>
      <p class="meta">2. Gegen welchen Dienst tauscht ihr?</p>
      <div class="list">${others.map((d) => radio('theirs', d, 'Familie ' + d.family)).join('') || '<p class="meta" style="padding:12px 16px">Keine Dienste zum Tauschen.</p>'}</div>
      <p class="meta">3. Nachricht (freiwillig)</p>
      <textarea id="swap-msg" rows="2" maxlength="300" class="input" placeholder="z. B. Wir sind in der Woche im Urlaub"></textarea>
      <button class="btn add" id="swap-send" disabled>Anfrage senden</button>`}
  `);

  const send = document.getElementById('swap-send');
  const ready = () => { if (send) send.disabled = !($view.querySelector('input[name=mine]:checked') && $view.querySelector('input[name=theirs]:checked')); };
  $view.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', ready));
  const act = async (fn, okText) => {
    try { await renderPutz(await fn()); if (okText) alert(okText); } catch (e) { alert(e.message); }
  };
  send?.addEventListener('click', () => {
    send.disabled = true;
    act(() => api.putzSwap($view.querySelector('input[name=mine]:checked').value, $view.querySelector('input[name=theirs]:checked').value, document.getElementById('swap-msg').value),
      'Die Anfrage ist raus. Die andere Familie bekommt eine Mail und sieht sie in der App.');
  });
  $view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const id = b.closest('[data-id]').dataset.id;
    const ask = { accept: 'Wirklich tauschen? Der Kalender wird sofort geändert.', undo: 'Den Tausch wirklich zurücknehmen?' }[b.dataset.act];
    if (ask && !confirm(ask)) return;
    act(() => api.putzRespond(id, b.dataset.act), b.dataset.act === 'accept' ? 'Getauscht. Beide Familien bekommen eine Bestätigung.' : '');
  }));
}

// ---------- Abwesenheit ----------
// Hinweis, an wen sich Eltern wenden, wenn ihre Familie nicht gefunden wird
function helpHint() {
  return api.org.mailIt ? `Bitte schreibt an ${api.org.mailIt}` : 'Bitte meldet euch beim Team';
}

function absenceCard(abs) {
  if (!abs.enabled) return '';
  if (abs.team) {
    const today = (abs.list || []).filter((x) => x.from <= abs.today && x.to >= abs.today);
    return `<a class="card ${today.length ? 'highlight' : ''}" href="#/abwesend">
      <h3>🩺 Heute fehlen: ${today.length}</h3>
      <div class="meta ellipsis">${today.length ? esc(today.map(absName).join(', ')) : 'Keine Meldung für heute.'}</div>
      <span class="more">Zur Liste ›</span></a>`;
  }
  return abs.children.length ? `<a class="btn add" href="#/abwesend" style="margin:0 0 14px">🩺 Kind abwesend melden</a>` : '';
}

function absRange(x) {
  const d = (iso) => fmtDate(new Date(iso + 'T00:00:00'), { weekday: 'short', day: 'numeric', month: 'numeric' });
  return x.from === x.to ? d(x.from) : `${d(x.from)} – ${d(x.to)}`;
}

// „ab 9:00“ / „bis 9:00“ bei späterem Kommen oder früherem Gehen
function absWhen(x) {
  if (x.part === 'late' && x.time) return `kommt um ${x.time} Uhr`;
  if (x.part === 'early' && x.time) return `geht um ${x.time} Uhr`;
  return '';
}
const absName = (x) => x.child + (x.part === 'late' && x.time ? ` (ab ${x.time})` : x.part === 'early' && x.time ? ` (bis ${x.time})` : '');

async function viewAbwesend() {
  show('Abwesend', '<p class="empty">Lädt …</p>');
  const st = await api.absence();
  if (!st.enabled) return show('Abwesend', '<p class="empty">Dieser Bereich ist noch nicht freigeschaltet.</p>');
  renderAbwesend(st);
}

function renderAbwesend(st) {
  const kinds = Object.entries(st.kinds);
  const today = st.list ? st.list.filter((x) => x.from <= st.today && x.to >= st.today) : [];
  const later = st.list ? st.list.filter((x) => x.from > st.today) : [];
  const teamHtml = st.team ? `
    <h2 class="section">Heute fehlen: ${today.length}</h2>
    ${today.length ? `<div class="list">${today.map((x) => `<div class="row"><div class="grow"><div class="title">${esc(x.child)}</div><div class="meta">${esc([absRange(x), absWhen(x), x.note].filter(Boolean).join(' · '))}</div></div><span class="pill">${esc(st.kinds[x.kind] || x.kind)}</span></div>`).join('')}</div>` : '<p class="meta">Keine Meldung für heute.</p>'}
    ${later.length ? `<h2 class="section">Kommende Tage</h2><div class="list">${later.map((x) => `<div class="row"><div class="grow"><div class="title">${esc(x.child)}</div><div class="meta">${esc([absRange(x), absWhen(x), x.note].filter(Boolean).join(' · '))}</div></div><span class="pill">${esc(st.kinds[x.kind] || x.kind)}</span></div>`).join('')}</div>` : ''}
    <a class="more" href="#/abwesend/pruefen">Stimmen die Daten? Prüfseite ›</a>` : '';
  const formHtml = st.children.length ? `
    <h2 class="section">Kind abwesend melden</h2>
    <form class="form" id="abs-form">
      ${st.children.length > 1
        ? `<label>Kind<select name="child">${st.children.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>`
        : `<input type="hidden" name="child" value="${esc(st.children[0])}"><p class="meta">Kind: <b>${esc(st.children[0])}</b></p>`}
      <div class="field-title">Wann?
        <div class="segmented three">${Object.entries(st.parts || { day: 'ganztägig' }).map(([k, label], i) => `<label><input type="radio" name="part" value="${esc(k)}" ${i === 0 ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>
      </div>
      <div class="two">
        <label>von<input type="date" name="from" required value="${st.today}"></label>
        <label id="abs-to">bis<input type="date" name="to" required value="${st.today}"></label>
        <label id="abs-time" hidden>Uhrzeit<input type="time" name="time" value="09:00"></label>
      </div>
      <div class="field-title">Grund
        <div class="list">${kinds.map(([k, label], i) => `<label class="row choose ${i === 0 ? 'on' : ''}"><input type="radio" name="kind" value="${esc(k)}" ${i === 0 ? 'checked' : ''}><div class="grow"><div class="title">${esc(label)}</div></div></label>`).join('')}</div>
      </div>
      <label id="abs-note" hidden>Anmerkung (freiwillig)<input name="note" maxlength="30" placeholder="z. B. Arzttermin" autocomplete="off"></label>
      <button class="btn" type="submit">Melden</button>
      <p class="meta">Gespeichert werden nur Vorname, Zeitraum, Art und eine freiwillige kurze Anmerkung. Bitte keine Diagnose angeben. Das Team sieht die Meldung, sonst niemand.</p>
    </form>` : (st.team ? '' : '<p class="meta">Wir finden eure Familie nicht. ${esc(helpHint())}, damit eure Mailadresse in der Elternliste ergänzt wird.</p>');
  const mineHtml = st.mine.length ? `
    <h2 class="section">Eure Meldungen</h2>
    <div class="list">${st.mine.map((x) => `<div class="row" data-id="${x.id}"><div class="grow"><div class="title">${esc(x.child)}</div><div class="meta">${esc([absRange(x), absWhen(x), st.kinds[x.kind] || x.kind, x.note].filter(Boolean).join(' · '))}</div></div><button class="btn secondary" data-cancel>Zurückziehen</button></div>`).join('')}</div>` : '';
  show('Abwesend', teamHtml + formHtml + mineHtml);

  const form = document.getElementById('abs-form');
  if (form) {
    const syncPart = () => {
      const day = form.elements.part.value === 'day';
      document.getElementById('abs-to').hidden = !day;
      document.getElementById('abs-time').hidden = day;
      document.getElementById('abs-time').querySelector('input').required = !day;
      document.querySelector('#abs-form [name=time]').closest('label').firstChild.textContent = form.elements.part.value === 'late' ? 'Kommt um' : 'Geht um';
    };
    form.querySelectorAll('[name=part]').forEach((r) => r.addEventListener('change', syncPart));
    syncPart();
    form.querySelectorAll('.row.choose input').forEach((r) => r.addEventListener('change', () => {
      form.querySelectorAll('.row.choose').forEach((row) => row.classList.toggle('on', row.querySelector('input').checked));
      document.getElementById('abs-note').hidden = form.elements.kind.value !== 'sonstiges';
    }));
    form.elements.from.addEventListener('change', () => { if (form.elements.to.value < form.elements.from.value) form.elements.to.value = form.elements.from.value; });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      try {
        const next = await submitting(form, () => api.absenceReport({ child: f.child, from: f.from, to: f.part === 'day' ? f.to : f.from, kind: f.kind, part: f.part || 'day', time: f.part === 'day' ? '' : (f.time || ''), note: f.kind === 'sonstiges' ? (f.note || '') : '' }), 'Das hat leider nicht geklappt.');
        renderAbwesend(next);
        alert(`Danke, ${f.child} ist abgemeldet.`);
      } catch {}
    });
  }
  $view.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Die Meldung wirklich zurückziehen?')) return;
    try { renderAbwesend(await api.absenceCancel(b.closest('[data-id]').dataset.id)); } catch (e) { alert(e.message); }
  }));
}

async function viewAbwesendPruefen() {
  show('Prüfseite', '<p class="empty">Lädt …</p>');
  let r;
  try { r = await api.absenceCheck(); } catch (e) { return show('Prüfseite', errorBox('Nur für das Team.', e)); }
  const bad = r.cards.filter((c) => c.issues.length);
  show('Prüfseite', `
    <p class="meta">${r.families} Familienkarten, ${r.children} Kinder mit Geburtsdatum. Es wird nichts automatisch geändert.</p>
    <h2 class="section">Elternkarten mit Hinweis (${bad.length})</h2>
    ${bad.length ? `<div class="list">${bad.map((c) => `<div class="row"><div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${c.issues.map(esc).join('<br>')}${c.ignored.length ? '<br>Ohne Geburtsdatum, zählt nicht: ' + c.ignored.map(esc).join(', ') : ''}</div></div></div>`).join('')}</div>` : '<p class="meta">Alle Karten sind in Ordnung.</p>'}
    <h2 class="section">Nutzer ohne passende Karte (${r.usersWithoutCard.length})</h2>
    <p class="meta">Ihre Mailadresse steht in keiner Elternkarte. Sie könnten kein Kind melden.</p>
    ${r.usersWithoutCard.length ? `<div class="list">${r.usersWithoutCard.map((u) => `<div class="row"><div class="grow"><div class="title">${esc(u.name)}</div><div class="meta">${u.mail ? esc(u.mail) : 'keine Mailadresse im Konto'}</div></div></div>`).join('')}</div>` : ''}
    <h2 class="section">Alle Familien</h2>
    <div class="list">${r.cards.map((c) => `<div class="row"><div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${c.children.length ? c.children.map(esc).join(', ') : '–'}</div></div></div>`).join('')}</div>`);
}

// ---------- Meldungen auf der Startseite ----------
function ankuendigungCard(a) {
  const teaser = firstParagraph(a.text);
  return `
    <a class="card highlight" href="#/aktuell/${a.id}">
      <h3>📣 ${esc(a.title)}</h3>
      ${teaser ? `<div class="meta">${esc(teaser)}</div>` : ''}
      <span class="more">Mehr ›</span>
    </a>`;
}

async function viewAnkuendigung(id) {
  show('Aktuell', '<p class="empty">Lädt …</p>');
  const { items } = await api.ankList();
  const a = items.find((x) => x.id === id);
  if (!a) return show('Aktuell', '<p class="empty">Diese Meldung gibt es nicht mehr.</p>');
  show(a.title, `
    ${a.image ? `<img class="ank-img" src="${esc(api.ankImage(a.id, a.updated))}" alt="">` : ''}
    <article class="page">${markdown(a.text)}</article>
    ${a.buttons.map((b, i) => `<a class="btn${i ? ' secondary' : ''} add" href="${esc(b.href)}"${b.href.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${esc(b.label)}</a>`).join('')}`);
  $view.querySelector('.ank-img')?.addEventListener('click', (ev) => {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<button class="close" aria-label="Schließen">✕</button><img src="${ev.target.src}" alt="">`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  });
}

// Vorstand: Übersicht aller Meldungen
async function viewMeldungen() {
  show('Meldungen', '<p class="empty">Lädt …</p>');
  const { canPost, items } = await api.ankList();
  if (!canPost) return show('Meldungen', '<p class="empty">Meldungen schreibt der Vorstand.</p>');
  const status = (a) => (a.active ? '<span class="pill ok">sichtbar</span>' : a.upcoming ? `<span class="pill">ab ${esc(fmtDate(new Date(a.from + 'T00:00:00'), { day: 'numeric', month: 'short' }))}</span>` : '<span class="pill off">abgelaufen</span>');
  show('Meldungen', `
    <a class="btn add" href="#/meldungen/neu">＋ Neue Meldung</a>
    ${items.length ? `<div class="list">${items.map((a) => `
      <a class="row" href="#/meldungen/${a.id}">
        <div class="grow"><div class="title">${esc(a.title)}</div>
          <div class="meta">${esc(fmtDate(new Date(a.from + 'T00:00:00'), { day: 'numeric', month: 'short' }))} – ${esc(fmtDate(new Date(a.until + 'T00:00:00'), { day: 'numeric', month: 'short', year: 'numeric' }))} · ${esc(a.author)}</div></div>
        ${status(a)}<span class="chev">›</span>
      </a>`).join('')}</div>` : '<p class="empty">Noch keine Meldungen.</p>'}
    <p class="meta">Eltern sehen eine Meldung oben auf der Startseite, solange sie gültig ist.</p>`);
}

// Bild im Handy verkleinern (längste Seite 1400 px), damit der Upload schnell geht
function resizeImage(file, max = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    img.src = URL.createObjectURL(file);
  });
}

// Eingefügte Cloud-Links in das Format der App umwandeln: Handbuch-Seite → App-Seite, Datei (/f/ID, ?fileid=ID) → PDF-/Bild-Ansicht
function normLink(raw) {
  const v = raw.trim();
  if (!v || v.startsWith('#/')) return v;
  const wiki = v.match(/\/apps\/collectives\/.*?-(\d+)(?:[?#].*)?$/);
  if (wiki) return `#/handbuch/${wiki[1]}`;
  const file = v.match(/\/f\/(\d+)/) || v.match(/[?&]fileid=(\d+)/i) || v.match(/\/apps\/kitaapp\/datei\/(\d+)/);
  if (file) return `${location.origin}${(api.webroot || '')}/index.php/apps/kitaapp/datei/${file[1]}/`;
  return v;
}

async function viewMeldungForm(id) {
  const isNew = id === 'neu';
  show(isNew ? 'Neue Meldung' : 'Meldung bearbeiten', '<p class="empty">Lädt …</p>');
  const [{ canPost, items, mailCount }, hbPages] = await Promise.all([api.ankList(), api.allPages().catch(() => [])]);
  if (!canPost) return show('Meldung', '<p class="empty">Meldungen schreibt der Vorstand.</p>');
  const a = isNew ? null : items.find((x) => x.id === id);
  if (!isNew && !a) return show('Meldung', '<p class="empty">Diese Meldung gibt es nicht mehr.</p>');
  const today = isoDay(new Date());
  const inTwoWeeks = isoDay(new Date(Date.now() + 14 * 864e5));
  const targets = [['', 'kein Knopf'], ['#/umfragen', 'Umfragen'], ['#/termine', 'Termine'], ['#/chat', 'Chat'], ['#/handbuch', 'Handbuch'], ['#/putz', 'Putzdienst tauschen'], ['seite', 'Handbuch-Seite …'], ['link', 'Eigener Link …']];
  const href = a?.buttons[0]?.href || '';
  const pageHref = (href.match(/^#\/handbuch\/(\d+)$/) || [])[1];
  const asPage = !!pageHref && hbPages.some((x) => x.id === pageHref);
  const known = asPage || targets.some(([v]) => v === href);
  const cur = asPage ? 'seite' : href;
  show(isNew ? 'Neue Meldung' : 'Meldung bearbeiten', `
    <form class="form" id="ank-form">
      <label>Titel<input name="title" required maxlength="120" value="${esc(a?.title || '')}" placeholder="z. B. Herbstferien im Waldkindergarten"></label>
      <label>Text<textarea name="text" rows="6" maxlength="3000" placeholder="Was sollen die Eltern wissen?">${esc(a?.text || '')}</textarea></label>
      <div class="field-title">Bild (freiwillig)</div>
      ${a?.image ? `<img class="ank-img small" src="${esc(api.ankImage(a.id, a.updated))}" alt=""><label class="check-row"><input type="checkbox" name="removeImage"> Bild entfernen</label>` : ''}
      <input type="file" name="file" accept="image/*">
      <div class="two">
        <label>Anzeigen ab<input type="date" name="validFrom" required value="${esc(a?.from || today)}"></label>
        <label>bis einschließlich<input type="date" name="validUntil" required value="${esc(a?.until || inTwoWeeks)}"></label>
      </div>
      <label>Knopf (freiwillig)
        <select name="target">${targets.map(([v, l]) => `<option value="${v}"${(known ? v === cur : v === 'link') ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="when-page" hidden>Welche Seite?
        <select name="page">${hbPages.map((x) => `<option value="${esc(x.id)}"${x.id === pageHref ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>
      <label class="when-btn" hidden>Beschriftung<input name="buttonLabel" maxlength="40" value="${esc(a?.buttons[0]?.label || '')}" placeholder="z. B. Zur Umfrage"></label>
      <label class="when-link" hidden>Link<input name="customHref" inputmode="url" value="${esc(known ? '' : href)}" placeholder="https://…"><span class="meta">Links aus der Cloud (Handbuch-Seite oder Datei) werden automatisch passend umgewandelt.</span></label>
      ${mailCount ? `<label class="check-row"><input type="checkbox" name="notify"${isNew ? ' checked' : ''}> ${a?.notified ? 'Noch einmal ' : ''}Eltern per E-Mail informieren (${mailCount} Adressen)</label>
      ${a?.notified ? `<p class="meta">Schon am ${fmtDate(new Date(a.notified * 1000), { day: 'numeric', month: 'long' })} per E-Mail verschickt.</p>` : ''}` : ''}
      <button class="btn" type="submit">${isNew ? 'Veröffentlichen' : 'Speichern'}</button>
      ${isNew ? '' : '<button class="btn secondary" type="button" id="ank-del">Meldung löschen</button>'}
    </form>`);
  const form = document.getElementById('ank-form');
  const sync = () => {
    const t = form.elements.target.value;
    form.querySelector('.when-btn').hidden = !t;
    form.querySelector('.when-link').hidden = t !== 'link';
    form.querySelector('.when-page').hidden = t !== 'seite';
  };
  form.elements.target.addEventListener('change', sync);
  sync();
  document.getElementById('ank-del')?.addEventListener('click', async () => {
    if (!confirm('Diese Meldung wirklich löschen?')) return;
    try { await api.ankDelete(a.id); location.hash = '#/meldungen'; } catch (e) { alert(e.message); }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = form.elements;
    const target = f.target.value;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const data = {
        title: f.title.value.trim(), text: f.text.value.trim(), validFrom: f.validFrom.value, validUntil: f.validUntil.value,
        buttonHref: target === 'link' ? normLink(f.customHref.value) : target === 'seite' ? `#/handbuch/${f.page.value}` : target,
        buttonLabel: f.buttonLabel.value.trim(),
        removeImage: !!f.removeImage?.checked,
        notify: !!f.notify?.checked,
      };
      if (f.file.files[0]) data.image = await resizeImage(f.file.files[0]);
      const res = await api.ankSave(a?.id, data);
      if (res?.mailed) alert(`Veröffentlicht. ${res.mailed} Eltern wurden per E-Mail informiert.`);
      location.hash = '#/meldungen';
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
    }
  });
}

// ---------- Wochenrückblick (nur Team) ----------
// Entwurf wird beim Tippen gespeichert; „Veröffentlichen“ setzt den Eintrag oben ins Kindergartentagebuch
async function viewRueckblick() {
  show('Wochenrückblick', '<p class="empty">Lädt …</p>');
  const st = await api.diary();
  if (!st.canWrite) return show('Wochenrückblick', '<p class="empty">Den Wochenrückblick schreibt das Team.</p>');
  const d = st.draft || {};
  show('Wochenrückblick', `
    <form class="form" id="diary-form">
      <label>Titel<input name="title" required maxlength="120" value="${esc(d.title || st.suggestion.title)}"></label>
      <label>Text<textarea name="text" rows="14" maxlength="8000">${esc(d.text || st.suggestion.text)}</textarea></label>
      <label>Link zu den Fotos (Immich-Freigabe)<input name="link" inputmode="url" value="${esc(d.link || '')}" placeholder="${esc((api.org.photoHost || 'https://fotos.example.org') + '/share/…')}"></label>
      <div class="cover-pick" id="cover-pick" hidden>
        <p class="meta" id="cover-state"></p>
        <div class="cover-grid" id="cover-grid"></div>
      </div>
      <input type="hidden" name="cover" value="${esc(d.cover || '')}">
      <label class="check-row"><input type="checkbox" name="notify" checked> Eltern per E-Mail informieren (an ${esc(st.mailTo)})</label>
      <p class="meta" id="diary-state">${d.updated ? `Entwurf von ${esc(d.by || '')}, gespeichert ${fmtRelative(new Date(d.updated * 1000))}.` : 'Dein Text wird als Entwurf gespeichert, bis du veröffentlichst.'}${st.last ? ` Letzter Eintrag: ${esc(st.last)}.` : ''}</p>
      <button class="btn" type="submit">Veröffentlichen</button>
    </form>`);
  const form = document.getElementById('diary-form');
  const stateEl = document.getElementById('diary-state');
  const data = () => ({ title: form.elements.title.value.trim(), text: form.elements.text.value.trim(), link: form.elements.link.value.trim(), cover: form.elements.cover.value });
  let timer = null, dirty = false;
  // Titelbild: Fotos aus dem verlinkten Album zeigen, ein Tipp wählt das Bild aus
  const pick = document.getElementById('cover-pick');
  const grid = document.getElementById('cover-grid');
  const coverState = document.getElementById('cover-state');
  let shownLink = '';
  const markCover = () => grid.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === form.elements.cover.value));
  const loadCovers = async () => {
    const link = form.elements.link.value.trim();
    if (link === shownLink) return;
    shownLink = link;
    if (!api.org.photoHost || !link.startsWith(api.org.photoHost + '/share/')) { pick.hidden = true; return; }
    pick.hidden = false;
    coverState.textContent = 'Fotos werden geladen …';
    grid.innerHTML = '';
    try {
      const res = await api.diaryPhotos(link);
      if (!form.elements.cover.value) form.elements.cover.value = res.cover || '';
      grid.innerHTML = res.photos.map((id) => `<button type="button" data-id="${id}" aria-label="Als Titelbild wählen"><img loading="lazy" alt="" src="${api.diaryPhotoUrl(link, id)}"></button>`).join('');
      coverState.textContent = res.photos.length ? 'Titelbild wählen (erscheint im Tagebuch und in der E-Mail):' : 'Im Album sind noch keine Fotos.';
      markCover();
    } catch (e) {
      shownLink = '';
      coverState.textContent = 'Fotos konnten nicht geladen werden: ' + (e.message || e);
    }
  };
  grid.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-id]');
    if (!b) return;
    form.elements.cover.value = b.dataset.id;
    markCover();
    dirty = true; clearTimeout(timer); timer = setTimeout(saveDraft, 1500);
  });
  form.elements.link.addEventListener('change', () => { form.elements.cover.value = ''; loadCovers(); });
  loadCovers();
  const saveDraft = async () => {
    if (!dirty) return;
    dirty = false;
    try { await api.diaryDraft(data()); stateEl.textContent = 'Entwurf gespeichert.'; } catch (e) { dirty = true; stateEl.textContent = 'Entwurf konnte nicht gespeichert werden: ' + (e.message || e); }
  };
  form.addEventListener('input', () => { dirty = true; clearTimeout(timer); timer = setTimeout(saveDraft, 1500); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearTimeout(timer);
    const notify = form.elements.notify.checked;
    if (!confirm(notify ? 'Jetzt im Kindergartentagebuch veröffentlichen und die Eltern per E-Mail informieren?' : 'Jetzt im Kindergartentagebuch veröffentlichen (ohne E-Mail)?')) return;
    await submitting(form, async () => {
      const res = await api.diaryPublish({ ...data(), notify });
      dirty = false;
      alert(res.mailed ? 'Veröffentlicht. Die Eltern wurden per E-Mail informiert.' : 'Veröffentlicht.');
      location.hash = '#/start';
    }, 'Das Veröffentlichen hat nicht geklappt.');
  });
}

// ---------- Einbau-Hilfe: App auf den Home-Bildschirm legen ----------
// ?install=ios|android|inapp erzwingt die Anzeige (zum Ausprobieren am Computer)
const installTest = new URLSearchParams(location.search).get('install');
let installPrompt = null; // Android/Chrome: echtes Installieren-Fenster
window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installPrompt = ev; });
window.addEventListener('appinstalled', () => { remember('kita-installed', Date.now()); document.getElementById('install-card')?.remove(); });

function installPlatform() {
  if (installTest) return installTest;
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return null;
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|Snapchat|; wv\)/.test(ua)) return 'inapp';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null; // Computer: kein Hinweis
}

function installCard() {
  const platform = installPlatform();
  const later = Number(recall('kita-install-later')) || 0;
  if (!platform || (!installTest && (recall('kita-installed') || Date.now() - later < 14 * 864e5))) return '';
  return `
    <div class="card green install" id="install-card">
      <h3>📲 KiTa-App auf den Home-Bildschirm</h3>
      <div class="meta">Dann öffnet sie sich mit einem Tipp – wie eine richtige App.</div>
      <div class="actions">
        <button class="btn" id="install-go">${platform === 'inapp' ? 'Wie geht das?' : "So geht's"}</button>
        <button class="btn secondary" id="install-later">Später</button>
      </div>
    </div>`;
}

function bindInstallCard() {
  const card = document.getElementById('install-card');
  if (!card) return;
  document.getElementById('install-later').addEventListener('click', () => {
    remember('kita-install-later', Date.now());
    card.remove();
  });
  document.getElementById('install-go').addEventListener('click', async () => {
    if (installPrompt && !installTest) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      if (outcome === 'accepted') return card.remove();
    }
    showInstallSteps(installPlatform());
  });
}

function showInstallSteps(platform) {
  const share = `<svg class="ios-share" viewBox="0 0 20 24" aria-label="Teilen-Symbol"><path d="M10 15V2M5.5 6.5 10 2l4.5 4.5M6 10H3v12h14V10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const steps = {
    ios: [
      `Tippe unten in Safari auf das Teilen-Symbol ${share}.<br><span class="meta">Siehst du es nicht, tippe zuerst unten rechts auf <b>•••</b>.</span>`,
      `Wische etwas nach oben und wähle <b>„Zum Home-Bildschirm“</b>.`,
      `Tippe oben rechts auf <b>„Hinzufügen“</b>.`,
      `Fertig! Öffne die KiTa-App ab jetzt über das neue Symbol und melde dich dort einmal an.`,
    ],
    android: [
      `Tippe oben rechts auf <b>⋮</b> (drei Punkte).`,
      `Wähle <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b>.`,
      `Bestätige mit <b>„Installieren“</b> bzw. <b>„Hinzufügen“</b>.`,
      `Fertig! Öffne die KiTa-App ab jetzt über das neue Symbol.`,
    ],
    inapp: [
      `Diese Seite ist gerade in einer anderen App geöffnet. Von hier aus klappt es leider nicht.`,
      `Tippe auf <b>„Adresse kopieren“</b>.`,
      `Öffne <b>Safari</b> (iPhone) oder <b>Chrome</b> (Android), füge die Adresse oben ein und melde dich an.`,
      `Dort erscheint dieser Hinweis wieder – dann einfach den Schritten folgen.`,
    ],
  }[platform] || [];
  const sheet = document.createElement('div');
  sheet.className = 'sheet-backdrop';
  sheet.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Auf den Home-Bildschirm legen">
      <h3>So kommt die KiTa-App auf dein Handy</h3>
      <ol class="steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      ${platform === 'inapp' ? '<button class="btn" id="copy-url">Adresse kopieren</button>' : ''}
      <button class="btn secondary" id="sheet-close">Schließen</button>
    </div>
    ${platform === 'ios' ? '<div class="sheet-arrow" aria-hidden="true">↓</div>' : ''}`;
  document.body.append(sheet);
  const close = () => sheet.remove();
  sheet.addEventListener('click', (ev) => { if (ev.target === sheet) close(); });
  sheet.querySelector('#sheet-close').addEventListener('click', close);
  sheet.querySelector('#copy-url')?.addEventListener('click', async (ev) => {
    const url = location.href.split('#')[0].split('?')[0];
    try { await navigator.clipboard.writeText(url); ev.target.textContent = 'Kopiert ✓'; }
    catch { prompt('Adresse kopieren:', url); }
  });
}

// localStorage kann fehlen (privater Modus) – dann kommt der Hinweis eben wieder
function remember(key, value) { try { localStorage.setItem(key, value); } catch {} }
function recall(key) { try { return localStorage.getItem(key); } catch { return null; } }

function tagebuchCard(page) {
  const { title, teaser } = latestDiaryEntry(page.body);
  return `
    <h2 class="section">Aus dem Tagebuch</h2>
    <a class="card" href="#/handbuch/${encodeURIComponent(page.id)}">
      <h3>📔 ${esc(title || page.title)}</h3>
      <div class="meta">${esc(teaser)}</div>
      <span class="more">Weiterlesen ›</span>
    </a>`;
}

// Das Tagebuch hat oben einen festen Einleitungstext, danach den neuesten Eintrag
// ("Wochenrückblick …" oder eine Überschrift). Titel und ersten echten Absatz herausziehen.
function latestDiaryEntry(md) {
  const lines = md.split('\n').map((l) => l.trim());
  // Einträge beginnen mit "##### Titel" (egal ob Wochenrückblick, Herbstferienwoche …)
  let i = lines.findIndex((l) => /^#####\s/.test(l));
  if (i < 0) i = lines.findIndex((l) => /^(#+\s*)?(\*\*)?wochenr(ü|ue)ckblick/i.test(l));
  if (i < 0) i = lines.findIndex((l, n) => n > 0 && /^#{2,3}\s/.test(l));
  if (i < 0) return { title: '', teaser: firstParagraph(md) };
  const title = stripMd(lines[i]);
  const rest = lines.slice(i + 1).filter((l) => l && !/^(!\[|#|>|---)/.test(l));
  // Begrüßungen und sehr kurze Zeilen überspringen
  const teaserLine = rest.find((l) => stripMd(l).length > 60 && !/^liebe/i.test(l)) || rest[0] || '';
  return { title, teaser: shorten(stripMd(teaserLine), 150) };
}

// ---------- Termine ----------
async function viewTermine() {
  show('Termine', '<p class="empty">Lädt …</p>');
  const [events, writable, polls, putz] = await Promise.all([
    api.upcomingEvents(200), api.calendars().catch(() => []), api.polls().catch(() => []), api.putz().catch(() => null),
  ]);
  let lastMonth = '';
  const html = events.map((e) => {
    const month = fmtDate(e.start, { month: 'long', year: 'numeric' });
    const head = month !== lastMonth ? `${lastMonth ? '</div>' : ''}<div class="month">${month}</div><div class="list">` : '';
    lastMonth = month;
    return head + eventRow(e);
  }).join('') + (events.length ? '</div>' : '');
  show('Termine', terminTabs('liste') + (putz && putz.current ? putzCard(putz.current) : '') + pollsCard(polls) + '<a class="btn secondary add" href="#/putz">🔁 Putzdienst tauschen</a>' + (writable.length ? '<a class="btn add" href="#/termine/neu">＋ Termin eintragen</a>' : '') +
    (html || '<p class="empty">Keine anstehenden Termine.</p>') +
    (api.demo ? '' : '<p class="meta" style="margin-top:16px">Tipp: Den Kita-Kalender könnt ihr auch in der Kalender-App eures Handys abonnieren – siehe Handbuch.</p>'));
}

function terminTabs(active) {
  if (!api.monthView) return '';
  return `<div class="viewtabs"><a href="#/termine" class="${active === 'liste' ? 'on' : ''}">Liste</a><a href="#/termine/monat" class="${active === 'monat' ? 'on' : ''}">Monat</a></div>`;
}

// Monatsübersicht: Raster mit Punkten an Tagen mit Terminen, Tipp auf einen Tag zeigt dessen Termine
let monatTag = null;
async function viewMonat(ym) {
  if (!api.monthView) return viewTermine();
  show('Termine', terminTabs('monat') + '<p class="empty">Lädt …</p>');
  const events = await api.monthEvents();
  const now = new Date();
  const [y, m] = ym ? ym.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Woche beginnt am Montag
  const dayKey = (d) => isoDay(d);
  const byDay = {};
  for (const e of events) {
    const s = new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate());
    const end = e.end ? new Date(e.end.getFullYear(), e.end.getMonth(), e.end.getDate()) : s;
    for (let d = s; d <= end && d - s < 40 * 864e5; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      if (d.getFullYear() === y && d.getMonth() === m - 1) (byDay[dayKey(d)] = byDay[dayKey(d)] || []).push(e);
    }
  }
  const todayKey = dayKey(now);
  const prev = new Date(y, m - 2, 1), next = new Date(y, m, 1);
  const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const selKey = monatTag && monatTag.startsWith(ymOf(first)) ? monatTag : (todayKey.startsWith(ymOf(first)) ? todayKey : null);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell blank"></span>');
  for (let d = 1; d <= days; d++) {
    const key = `${ymOf(first)}-${String(d).padStart(2, '0')}`;
    const evs = byDay[key] || [];
    const dots = evs.slice(0, 3).map((e) => `<i class="${e.closed ? 'closed' : e.putz ? 'putz' : ''}"></i>`).join('');
    cells.push(`<button class="cal-cell${key === todayKey ? ' today' : ''}${key === selKey ? ' sel' : ''}" data-day="${key}"><b>${d}</b><span class="dots">${dots}</span></button>`);
  }
  const list = selKey ? (byDay[selKey] || []) : [];
  const selHtml = selKey
    ? `<div class="month">${fmtDate(new Date(selKey + 'T12:00:00'), { weekday: 'long', day: 'numeric', month: 'long' })}</div>` +
      (list.length ? `<div class="list">${list.map(eventRow).join('')}</div>` : '<p class="meta">Keine Termine an diesem Tag.</p>')
    : '<p class="meta">Tippe auf einen Tag, um seine Termine zu sehen.</p>';
  show('Termine', terminTabs('monat') + `
    <div class="cal-head">
      <a class="btn secondary" href="#/termine/monat/${ymOf(prev)}" aria-label="Vormonat">‹</a>
      <b>${fmtDate(first, { month: 'long', year: 'numeric' })}</b>
      <a class="btn secondary" href="#/termine/monat/${ymOf(next)}" aria-label="Folgemonat">›</a>
    </div>
    <div class="cal-grid"><span class="dow">Mo</span><span class="dow">Di</span><span class="dow">Mi</span><span class="dow">Do</span><span class="dow">Fr</span><span class="dow">Sa</span><span class="dow">So</span>${cells.join('')}</div>
    <p class="meta cal-legend"><i></i> Termin &nbsp; <i class="closed"></i> geschlossen &nbsp; <i class="putz"></i> Putzdienst</p>
    ${selHtml}`);
  $view.querySelectorAll('.cal-cell[data-day]').forEach((b) => b.addEventListener('click', () => { monatTag = b.dataset.day; viewMonat(ymOf(first)); }));
}

// Oberste Zeile im Kalender: offene Umfragen
function pollsCard(polls) {
  const open = polls.filter((p) => p.open);
  const todo = open.filter((p) => !p.voted).length;
  const meta = open.length
    ? `${open.length} offen${todo ? ` · <b>${todo} ohne deine Stimme</b>` : ' · überall abgestimmt'}`
    : 'Abstimmen oder selbst eine Umfrage starten';
  return `<div class="list polls-row"><a class="row" href="#/umfragen">
      <div style="font-size:24px">🗳️</div>
      <div class="grow"><div class="title">Umfragen</div><div class="meta">${meta}</div></div>
      <span class="chev">›</span>
    </a></div>`;
}

// Termine mit Beschreibung lassen sich antippen und klappen die Beschreibung (und den Ort als Kartenlink) auf
const eventStore = new Map();
function eventRow(e) {
  const time = e.allDay
    ? (e.end ? `bis ${fmtDate(e.end, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'ganztägig')
    : `${fmtTime(e.start)}${e.end ? '–' + fmtTime(e.end) : ''} Uhr`;
  const more = Boolean(e.description);
  const key = `${e.start.getTime()}|${e.title}`;
  if (more || e.canEdit) eventStore.set(key, e);
  return `
    <div class="event${more ? ' has-more' : ''}"${more ? ` data-ev="${esc(key)}"` : ''}>
      <div class="row"${more ? ' role="button" tabindex="0" aria-expanded="false"' : ''}>
        <div class="date-chip"><div class="d">${e.start.getDate()}</div><div class="m">${fmtDate(e.start, { weekday: 'short' })}</div></div>
        <div class="grow">
          <div class="title">${esc(e.title)}${e.closed ? '<span class="tag closed">geschlossen</span>' : ''}</div>
          <div class="meta">${time}${e.location ? ' · ' + esc(e.location) : ''}</div>
        </div>
        ${e.canEdit ? `<a class="edit-ev" href="#/termine/bearbeiten/${encodeURIComponent(e.uid)}" aria-label="Termin bearbeiten">✏️</a>` : ''}
        ${more ? '<span class="chev expand">⌄</span>' : ''}
      </div>
      ${more ? `<div class="event-detail" hidden>${linkify(esc(e.description)).replace(/\n/g, '<br>')}${e.location ? `<p class="meta"><a href="https://maps.apple.com/?q=${encodeURIComponent(e.location)}">📍 ${esc(e.location)} auf der Karte</a></p>` : ''}</div>` : ''}
    </div>`;
}

document.addEventListener('click', (ev) => {
  const row = ev.target.closest('.event.has-more > .row');
  if (!row || ev.target.closest('a')) return;
  const box = row.parentElement, detail = box.querySelector('.event-detail');
  const open = detail.hidden;
  detail.hidden = !open;
  row.setAttribute('aria-expanded', String(open));
  box.classList.toggle('open', open);
});
document.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('.event.has-more > .row')) { ev.preventDefault(); ev.target.click(); }
});

async function viewNeuerTermin() {
  show('Neuer Termin', '<p class="empty">Lädt …</p>');
  const calendars = await api.calendars();
  if (!calendars.length) return show('Neuer Termin', '<p class="empty">Du darfst in keinen Kalender schreiben.</p>');
  const today = isoDay(new Date());
  show('Neuer Termin', `
    <form class="form" id="event-form">
      <label>Was?<input name="title" required maxlength="200" placeholder="z. B. Laternenbasteln"></label>
      ${calendars.length > 1 ? `<label>Kalender<select name="calendar">${calendars.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>`
        : `<input type="hidden" name="calendar" value="${esc(calendars[0].id)}"><p class="meta">Wird eingetragen in: <b>${esc(calendars[0].name)}</b></p>`}
      <label class="check-row"><input type="checkbox" name="allDay"> Ganztägig</label>
      <div class="two">
        <label>Datum<input type="date" name="date" required value="${today}" min="${today}"></label>
        <label class="when-allday" hidden>bis (optional)<input type="date" name="until" min="${today}"></label>
      </div>
      <div class="two when-timed">
        <label>von<input type="time" name="from" value="15:00" step="300"></label>
        <label>bis<input type="time" name="to" value="16:00" step="300"></label>
      </div>
      <label>Wo? (optional)<input name="location" maxlength="200"></label>
      <label>Beschreibung (optional)<textarea name="description" rows="3"></textarea></label>
      <button class="btn" type="submit">Termin speichern</button>
      <p class="meta">Alle, die diesen Kalender sehen, sehen auch deinen Termin.</p>
    </form>`);
  const form = document.getElementById('event-form');
  const sync = () => {
    const allDay = form.elements.allDay.checked;
    form.querySelector('.when-allday').hidden = !allDay;
    form.querySelector('.when-timed').hidden = allDay;
  };
  form.elements.allDay.addEventListener('change', sync);
  const { from, to } = form.elements;
  from.addEventListener('change', () => {
    // Endzeit mitziehen, damit sie nicht vor dem Beginn liegt
    if (to.value <= from.value) to.value = addMinutes(from.value, 60);
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const allDay = !!f.allDay;
    const start = localDate(f.date, allDay ? '00:00' : f.from);
    let end = allDay ? (f.until && f.until > f.date ? localDate(f.until, '00:00') : null) : localDate(f.date, f.to);
    if (!allDay && end <= start) return alert('Das Ende muss nach dem Beginn liegen.');
    await submitting(form, () => api.addEvent({
      calendar: f.calendar, title: f.title.trim(), allDay, start, end,
      location: f.location.trim(), description: f.description.trim(),
    }), 'Der Termin konnte nicht gespeichert werden.');
    location.hash = '#/termine';
  });
}

// Termin ändern (nur wer in den Kalender schreiben darf, sieht den Stift)
async function viewTerminBearbeiten(uid) {
  show('Termin bearbeiten', '<p class="empty">Lädt …</p>');
  const ev = (await api.monthEvents()).find((e) => e.uid === uid && e.canEdit);
  if (!ev) return show('Termin bearbeiten', '<p class="empty">Diesen Termin kannst du nicht bearbeiten. Serientermine und Termine aus Kalendern ohne Schreibrecht ändert man in der KitaCloud.</p>');
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const end = ev.end || (ev.allDay ? null : new Date(ev.start.getTime() + 3600e3));
  show('Termin bearbeiten', `
    <form class="form" id="event-form">
      <label>Was?<input name="title" required maxlength="200" value="${esc(ev.title)}"></label>
      <p class="meta">Kalender: <b>${esc(ev.calendar)}</b></p>
      <label class="check-row"><input type="checkbox" name="allDay"${ev.allDay ? ' checked' : ''}> Ganztägig</label>
      <div class="two">
        <label>Datum<input type="date" name="date" required value="${isoDay(ev.start)}"></label>
        <label class="when-allday" hidden>bis (optional)<input type="date" name="until" value="${ev.allDay && ev.end ? isoDay(ev.end) : ''}"></label>
      </div>
      <div class="two when-timed">
        <label>von<input type="time" name="from" value="${ev.allDay ? '15:00' : hhmm(ev.start)}" step="300"></label>
        <label>bis<input type="time" name="to" value="${ev.allDay ? '16:00' : hhmm(end)}" step="300"></label>
      </div>
      <label>Wo? (optional)<input name="location" maxlength="200" value="${esc(ev.location || '')}"></label>
      <label>Beschreibung (optional)<textarea name="description" rows="6">${esc(ev.description || '')}</textarea></label>
      <button class="btn" type="submit">Änderung speichern</button>
      <p class="meta">Alle, die diesen Kalender sehen, sehen die Änderung.</p>
    </form>`);
  const form = document.getElementById('event-form');
  const sync = () => {
    const allDay = form.elements.allDay.checked;
    form.querySelector('.when-allday').hidden = !allDay;
    form.querySelector('.when-timed').hidden = allDay;
  };
  sync();
  form.elements.allDay.addEventListener('change', sync);
  const { from, to } = form.elements;
  from.addEventListener('change', () => { if (to.value <= from.value) to.value = addMinutes(from.value, 60); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const allDay = !!f.allDay;
    const start = localDate(f.date, allDay ? '00:00' : f.from);
    const stop = allDay ? (f.until && f.until > f.date ? localDate(f.until, '00:00') : null) : localDate(f.date, f.to);
    if (!allDay && stop <= start) return alert('Das Ende muss nach dem Beginn liegen.');
    await submitting(form, () => api.updateEvent(ev.href, {
      title: f.title.trim(), allDay, start, end: stop,
      location: f.location.trim(), description: f.description.trim(),
    }), 'Die Änderung konnte nicht gespeichert werden.');
    location.hash = '#/termine';
  });
}

// Formular sperren, solange gespeichert wird; bei Fehler Meldung und wieder freigeben
async function submitting(form, fn, failText) {
  const btn = form.querySelector('button[type=submit]');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Speichert …';
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    alert(`${failText}\n\n${e.message || e}`);
    btn.disabled = false;
    btn.textContent = label;
    throw e;
  }
}

// ---------- Chat ----------
async function viewChats() {
  show('Chat', '<p class="empty">Lädt …</p>');
  const chats = await api.chats();
  if (!chats.length) return show('Chat', '<p class="empty">Noch keine Unterhaltungen.</p>');
  show('Chat', `<div class="list">${chats.map((c) => `
      <a class="row" href="#/chat/${encodeURIComponent(c.token)}">
        ${avatarHtml(c)}
        <div class="grow">
          <div class="title ellipsis">${esc(c.name)}</div>
          <div class="meta ellipsis">${c.last ? esc((c.last.me ? 'Ich' : c.last.who) + ': ' + stripMd(c.last.text)) : ''}</div>
        </div>
        ${c.unread ? `<span class="badge">${c.unread}</span>` : `<span class="meta">${c.last ? fmtRelative(c.last.t) : ''}</span>`}
      </a>`).join('')}</div>
    ${api.demo ? '' : '<p class="meta" style="margin-top:12px">Für Benachrichtigungen aufs Handy gibt es die App „Nextcloud Talk“.</p>'}`);
}

function avatarHtml(c) {
  return c.avatarUrl
    ? `<img class="avatar" src="${esc(c.avatarUrl)}" alt="" loading="lazy">`
    : `<div class="avatar">${c.avatar || esc(c.name[0] || '?')}</div>`;
}

async function viewChat(token) {
  show('Chat', '<p class="empty">Lädt …</p>');
  const c = await api.chat(token);
  if (!c) return show('Chat', '<p class="empty">Unterhaltung nicht gefunden.</p>');
  api.markRead(token, c.lastId);
  show(c.name, `
    <div class="messages" id="msgs">${messagesHtml(c.messages)}</div>
    <div class="chat-pad" id="chatpad"></div>
    <form class="composer" id="composer">
      <div class="ctx" id="ctx" hidden></div>
      <input name="text" placeholder="Nachricht schreiben …" autocomplete="off" enterkeyhint="send">
      <button type="submit">Senden</button>
    </form>`);

  const $msgs = document.getElementById('msgs');
  let state = c.messages;
  const redraw = (messages) => {
    state = messages;
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
    $msgs.innerHTML = messagesHtml(messages);
    if (atBottom) window.scrollTo(0, document.body.scrollHeight);
  };

  // Antworten und Bearbeiten: eine Zeile über dem Eingabefeld zeigt, worauf sich die Nachricht bezieht
  let replyTo = null, editing = null;
  const $form = document.getElementById('composer'), $ctx = document.getElementById('ctx'), $pad = document.getElementById('chatpad');
  const setCtx = () => {
    const m = replyTo || editing;
    $ctx.hidden = !m;
    $pad.classList.toggle('tall', !!m);
    $form.querySelector('button[type=submit]').textContent = editing ? 'Speichern' : 'Senden';
    if (m) {
      $ctx.innerHTML = `<span class="ctx-text">${editing ? 'Nachricht bearbeiten' : 'Antwort an ' + esc(m.me ? 'dich' : m.who) + ': ' + esc(stripMd(m.text).slice(0, 60))}</span><button type="button" class="ctx-x" aria-label="Abbrechen">✕</button>`;
    }
  };
  $ctx.addEventListener('click', (ev) => {
    if (!ev.target.closest('.ctx-x')) return;
    if (editing) $form.text.value = '';
    replyTo = editing = null;
    setCtx();
  });

  $form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = ev.target.text;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const was = { replyTo, editing };
    try {
      if (editing) {
        redraw(await api.editMessage(token, editing.id, text));
      } else {
        redraw(await api.sendMessage(token, text, replyTo && replyTo.id));
        window.scrollTo(0, document.body.scrollHeight);
      }
      replyTo = editing = null;
      setCtx();
    } catch (e) {
      input.value = text;
      replyTo = was.replyTo; editing = was.editing;
      alert(editing
        ? 'Die Nachricht konnte nicht geändert werden. Talk erlaubt das nur für kurze Zeit nach dem Senden.'
        : 'Nachricht konnte nicht gesendet werden.');
    }
  });

  // Menü unter der Nachricht: Antworten, Kopieren, Bearbeiten, Löschen, Erinnerung
  const closeMenus = () => $msgs.querySelectorAll('.msgmenu').forEach((x) => x.remove());
  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* Rückfall unten */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* egal */ }
    ta.remove();
    return ok;
  };
  const remindAt = (key) => {
    const d = new Date();
    if (key === 'hour') return new Date(d.getTime() + 3600e3);
    if (key === 'evening') { d.setHours(18, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d; }
    if (key === 'morning') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; }
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(8, 0, 0, 0); return d; // nächster Montag
  };
  const flash = (btn, text) => { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1500); };

  const menuAction = async (act, id, btn) => {
    const m = state.find((x) => x.id === id);
    if (!m) return;
    if (act === 'reply') {
      replyTo = m; editing = null; closeMenus(); setCtx(); $form.text.focus();
    } else if (act === 'copy') {
      flash(btn, (await copyText(m.text)) ? 'Kopiert ✓' : 'Nicht möglich');
    } else if (act === 'edit') {
      editing = m; replyTo = null; closeMenus(); setCtx();
      $form.text.value = m.text; $form.text.focus();
    } else if (act === 'delete') {
      if (!confirm('Diese Nachricht für alle löschen?')) return;
      try { redraw(await api.deleteMessage(token, id)); } catch (e) {
        alert('Die Nachricht konnte nicht gelöscht werden. Talk erlaubt das nur für kurze Zeit nach dem Senden.');
      }
    } else if (act === 'remind') {
      const menu = btn.closest('.msgmenu');
      menu.innerHTML = [['hour', 'In 1 Stunde'], ['evening', 'Heute Abend (18 Uhr)'], ['morning', 'Morgen früh (8 Uhr)'], ['week', 'Nächste Woche (Montag 8 Uhr)']]
        .map(([k, l]) => `<button type="button" data-id="${id}" data-remind="${k}">${l}</button>`).join('');
    }
  };
  const canChange = (m) => m.me && m.id !== undefined && m.plain !== false && Date.now() - m.t.getTime() < 6 * 3600e3;

  // Emoji-Reaktionen: Chip antippen = selbst reagieren oder zurücknehmen, „＋☺“ = Auswahl öffnen
  const toggleReaction = async (id, emoji) => {
    const m = state.find((x) => x.id === id);
    if (!m) return;
    const on = !m.mine.includes(emoji);
    // sofort zeigen, danach mit dem Stand des Servers abgleichen
    const reactions = { ...m.reactions, [emoji]: Math.max(0, (m.reactions[emoji] || 0) + (on ? 1 : -1)) };
    if (!reactions[emoji]) delete reactions[emoji];
    redraw(state.map((x) => x.id === id ? { ...x, reactions, mine: on ? [...x.mine, emoji] : x.mine.filter((e) => e !== emoji) } : x));
    try { redraw(await api.react(token, id, emoji, on)); } catch (e) {
      alert('Die Reaktion konnte nicht gespeichert werden.');
      try { redraw((await api.chat(token)).messages); } catch {}
    }
  };
  $msgs.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-id]');
    if (!b) return;
    const id = Number(b.dataset.id);
    if (b.dataset.remind) {
      const when = remindAt(b.dataset.remind);
      try {
        await api.remind(token, id, Math.floor(when.getTime() / 1000));
        flash(b, 'Gemerkt ✓');
        setTimeout(closeMenus, 900);
      } catch (e) { alert('Die Erinnerung konnte nicht gespeichert werden.'); }
      return;
    }
    if (b.dataset.act === 'more') {
      const msg = b.closest('.msg');
      const open = msg.querySelector('.msgmenu');
      closeMenus();
      $msgs.querySelectorAll('.picker').forEach((p) => p.remove());
      if (open) return;
      const m = state.find((x) => x.id === id);
      const menu = document.createElement('div');
      menu.className = 'msgmenu';
      menu.innerHTML = [['reply', 'Antworten'], ['copy', 'Kopieren'], ...(canChange(m) ? [['edit', 'Bearbeiten'], ['delete', 'Löschen']] : []), ['remind', 'Erinnerung …']]
        .map(([a, l]) => `<button type="button" data-id="${id}" data-act="${a}">${l}</button>`).join('');
      msg.querySelector('.time').after(menu);
      return;
    }
    if (b.dataset.act) return menuAction(b.dataset.act, id, b);
    if (b.dataset.emoji) return toggleReaction(id, b.dataset.emoji);
    // „＋☺“: Auswahl unter der Nachricht ein- oder ausblenden
    const msg = b.closest('.msg');
    const open = msg.querySelector('.picker');
    $msgs.querySelectorAll('.picker').forEach((p) => p.remove());
    closeMenus();
    if (open) return;
    const picker = document.createElement('div');
    picker.className = 'picker';
    picker.innerHTML = REACTIONS.map((e) => `<button type="button" data-id="${id}" data-emoji="${e}" aria-label="Mit ${e} reagieren">${e}</button>`).join('');
    msg.querySelector('.reacts').after(picker);
  });

  if (!api.demo) {
    refreshTimer = setInterval(async () => {
      if (document.hidden || $msgs.querySelector('.picker, .msgmenu')) return;
      try { redraw((await api.chat(token)).messages); } catch (e) { /* nächster Versuch */ }
    }, 10000);
  }
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉'];

function reactionsHtml(m) {
  if (m.id === undefined) return '';
  const chips = Object.entries(m.reactions || {}).map(([e, n]) =>
    `<button type="button" class="react${(m.mine || []).includes(e) ? ' mine' : ''}" data-id="${m.id}" data-emoji="${e}">${e} ${n}</button>`).join('');
  return `<div class="reacts">${chips}<button type="button" class="react add" data-id="${m.id}" aria-label="Mit Emoji reagieren">＋☺</button></div>`;
}

function messagesHtml(msgs) {
  let lastDay = '';
  return msgs.map((m) => {
    const dayLabel = fmtDay(m.t);
    const sep = dayLabel !== lastDay ? `<div class="day-sep">${dayLabel}</div>` : '';
    lastDay = dayLabel;
    return `${sep}<div class="msg${m.me ? ' me' : ''}">
      ${m.me ? '' : `<div class="who">${esc(m.who)}</div>`}
      ${m.reply ? `<div class="quote"><b>${esc(m.reply.who)}</b> ${m.reply.deleted ? '<i>Nachricht gelöscht</i>' : esc(stripMd(m.reply.text).slice(0, 90))}</div>` : ''}
      <div class="body">${/[#*`|]|^\s*[-*]\s/m.test(m.text) ? markdown(m.text) : linkify(esc(m.text)).replace(/\n/g, '<br>')}</div>
      ${reactionsHtml(m)}
      <div class="time">${m.edited ? 'bearbeitet · ' : ''}${fmtTime(m.t)}${m.id === undefined ? '' : ` <button type="button" class="more" data-id="${m.id}" data-act="more" aria-label="Mehr zu dieser Nachricht">⋯</button>`}</div>
    </div>`;
  }).join('');
}

function newestLast(chats) {
  const m = chats.map((c) => c.last).filter(Boolean).sort((a, b) => b.t - a.t)[0];
  return m ? `${m.who}: ${stripMd(m.text)}` : '';
}

// ---------- Umfragen ----------
async function viewUmfragen() {
  show('Umfragen', '<p class="empty">Lädt …</p>');
  const polls = await api.polls();
  const open = polls.filter((p) => p.open), closed = polls.filter((p) => !p.open);
  show('Umfragen', `
    ${api.createPoll ? '<a class="btn add" href="#/umfragen/neu">＋ Neue Umfrage</a>' : ''}
    ${open.length ? `<h2 class="section">Offen</h2><div class="list">${open.map(pollRow).join('')}</div>` : '<p class="empty">Gerade keine offenen Umfragen.</p>'}
    ${closed.length ? `<h2 class="section">Beendet</h2><div class="list">${closed.slice(0, 15).map(pollRow).join('')}</div>` : ''}`);
}

function pollRow(p) {
  const status = (p.isDate ? '📅 Terminumfrage · ' : '') + (p.open
    ? (p.voted ? '✓ Abgestimmt' : 'Noch nicht abgestimmt') + (p.ends ? ' · endet ' + fmtRelative(p.ends) : '')
    : 'beendet');
  return `
    <a class="row" href="#/umfragen/${encodeURIComponent(p.id)}">
      <div class="grow">
        <div class="title">${esc(p.title)}</div>
        <div class="meta">${status}</div>
      </div>
      <span class="chev">›</span>
    </a>`;
}

async function viewUmfrage(id) {
  show('Umfrage', '<p class="empty">Lädt …</p>');
  let p;
  try {
    p = await api.poll(id);
  } catch (e) {
    // 403/404: Umfrage ist privat (nur für Eingeladene) oder gelöscht
    if (/^(403|404) /.test(e.message)) {
      return show('Umfrage', `<p class="empty">Diese Umfrage ist für dich nicht freigegeben.<br>Sie ist vermutlich auf „privat“ gestellt oder wurde gelöscht. ${esc(helpHint())}.</p>
        <p class="page"><a class="btn secondary" href="#/umfragen">Alle Umfragen</a></p>`);
    }
    throw e;
  }
  if (!p) return show('Umfragen', '<p class="empty">Umfrage nicht gefunden.</p>');
  let busy = false;
  // „Wer?“ unter jeder Antwort: aufklappbar, damit die Übersicht ruhig bleibt; bleibt beim Neuzeichnen offen
  const openWho = new Set();
  const whoBlock = (o) => {
    const y = o.who?.yes || [], m = o.who?.maybe || [];
    if (!y.length && !m.length) return '';
    return `<details class="who" data-who="${esc(String(o.id ?? o.text))}"${openWho.has(String(o.id ?? o.text)) ? ' open' : ''}>
      <summary>Wer? (${y.length + m.length})</summary>
      <p>${y.length ? `${m.length ? '✓ ' : ''}${esc(y.join(', '))}` : ''}${m.length ? `${y.length ? '<br>' : ''}? ${esc(m.join(', '))}` : ''}</p>
    </details>`;
  };
  const trackWho = () => $view.querySelectorAll('details.who').forEach((d) => d.addEventListener('toggle', () => {
    d.open ? openWho.add(d.dataset.who) : openWho.delete(d.dataset.who);
  }));
  const addShare = () => {
    $view.insertAdjacentHTML('beforeend', '<button class="btn secondary" id="share-poll" style="margin-top:12px">🔗 Link zur Umfrage teilen</button>');
    document.getElementById('share-poll').addEventListener('click', async (ev) => {
      const url = location.href.split('#')[0].split('?')[0] + '#/umfragen/' + encodeURIComponent(p.id);
      const text = `${p.title}\nBitte am besten in der KiTa-App abstimmen (unter „Termine“ bei „Umfragen“). Dieser Link öffnet die Umfrage dort:\n${url}`;
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); ev.target.textContent = 'Kopiert ✓'; }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        prompt('Text kopieren:', text);
      }
    });
  };
  const draw = () => {
    if (p.isDate) { drawDates(); trackWho(); return addShare(); }
    const max = Math.max(1, ...p.options.map((o) => o.votes));
    show('Umfrage', `
      <div class="page"><h1>${esc(p.title)}</h1></div>
      ${p.description ? `<div class="sub page">${markdown(p.description)}</div>` : ''}
      ${p.options.map((o, i) => {
        const chosen = p.mine && p.mine.includes(i);
        return `<button class="option${chosen ? ' chosen' : ''}" data-i="${i}" ${p.open ? '' : 'disabled'}>
          <span class="check">${chosen ? '✓' : ''}</span>
          <span style="flex:1">${esc(o.text)}<div class="bar"><i style="width:${(o.votes / max) * 100}%"></i></div></span>
          <span class="count">${o.votes}</span>
        </button>${whoBlock(o)}`;
      }).join('')}
      <p class="meta">${p.open
        ? `${p.multi ? 'Mehrfachauswahl möglich' : 'Eine Antwort'}${p.ends ? ' · Abstimmung endet ' + fmtRelative(p.ends) : ''}`
        : 'Diese Umfrage ist beendet.'}</p>
      ${p.open && p.allowProposals ? `
        <form class="form proposal" id="proposal-form">
          <label>Eigener Vorschlag<input name="text" maxlength="200" placeholder="Was fehlt in der Liste?" required></label>
          <button class="btn secondary" type="submit">＋ Vorschlag hinzufügen</button>
        </form>` : ''}`);
    document.getElementById('proposal-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const text = ev.target.elements.text.value.trim();
      if (!text || busy) return;
      if (p.options.some((o) => o.text.toLowerCase() === text.toLowerCase())) return alert('Diesen Vorschlag gibt es schon in der Liste.');
      busy = true;
      try { p = await api.addOption(p.id, text, p.multi || !p.mine.length); } catch (e) { alert('Der Vorschlag konnte nicht gespeichert werden.'); }
      busy = false;
      draw();
    });
    $view.querySelectorAll('.option').forEach((b) => b.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      b.style.opacity = '.5';
      try { p = await api.vote(p.id, Number(b.dataset.i)); } catch (e) { alert('Stimme konnte nicht gespeichert werden.'); }
      busy = false;
      draw();
    }));
    trackWho();
    addShare();
  };
  const drawDates = () => {
    const max = Math.max(0, ...p.options.map((o) => o.votes));
    const choices = [['yes', '✓ Passt'], ...(p.allowMaybe ? [['maybe', '? Vielleicht']] : []), ['no', '✗ Geht nicht']];
    show('Umfrage', `
      <div class="page"><h1>${esc(p.title)}</h1></div>
      ${p.description ? `<div class="sub page">${markdown(p.description)}</div>` : ''}
      ${p.open ? '<p class="meta">Sag bei jeder Zeit, ob sie dir passt.</p>' : ''}
      ${p.options.map((o, i) => `
        <div class="slot${o.myAnswer ? ' ' + o.myAnswer : ''}">
          <div class="slot-head">
            <span class="grow">${esc(o.text)}${max && o.votes === max ? '<span class="tag">meiste Zusagen</span>' : ''}</span>
            <span class="count">${o.votes} ✓${o.maybe ? ` · ${o.maybe} ?` : ''}</span>
          </div>
          <div class="bar"><i style="width:${max ? (o.votes / max) * 100 : 0}%"></i></div>
          ${whoBlock(o)}
          ${p.open ? `<div class="answers">${choices.map(([a, label]) =>
            `<button data-i="${i}" data-a="${a}" class="${o.myAnswer === a ? 'on' : ''}">${label}</button>`).join('')}</div>` : ''}
        </div>`).join('')}
      <p class="meta">${p.open ? (p.ends ? 'Abstimmung endet ' + fmtRelative(p.ends) : '') : 'Diese Umfrage ist beendet.'}</p>`);
    $view.querySelectorAll('.answers button').forEach((b) => b.addEventListener('click', async () => {
      if (busy || b.classList.contains('on')) return;
      busy = true;
      b.closest('.answers').style.opacity = '.5';
      try { p = await api.answer(p.id, Number(b.dataset.i), b.dataset.a); } catch (e) { alert('Stimme konnte nicht gespeichert werden.'); }
      busy = false;
      draw();
    }));
  };
  draw();
}

async function viewNeueUmfrage() {
  show('Neue Umfrage', `
    <form class="form" id="poll-form">
      <div class="segmented" role="radiogroup" aria-label="Art der Umfrage">
        <label><input type="radio" name="kind" value="text" checked><span>Antworten</span></label>
        <label><input type="radio" name="kind" value="date"><span>📅 Termine</span></label>
      </div>
      <label>Frage<input name="title" required maxlength="200" placeholder="z. B. Wer bringt was zum Sommerfest mit?"></label>
      <label>Erklärung (optional)<textarea name="description" rows="2"></textarea></label>
      <div data-kind="text">
        <div class="field-title">Antworten</div>
        <div id="answers"></div>
      </div>
      <div data-kind="date" hidden>
        <div class="field-title">Zeiten zur Auswahl</div>
        <p class="meta">Ohne Uhrzeit gilt der ganze Tag.</p>
        <div id="slots"></div>
      </div>
      <button class="btn secondary" type="button" id="more">＋ weitere Antwort</button>
      <label class="check-row" data-kind="text"><input type="checkbox" name="multi"> Mehrere Antworten erlaubt</label>
      <label class="check-row" data-kind="text"><input type="checkbox" name="proposals" checked> Eltern dürfen eigene Vorschläge ergänzen</label>
      <label class="check-row" data-kind="date" hidden><input type="checkbox" name="maybe" checked> „Vielleicht“ als Antwort erlauben</label>
      <label>Abstimmung endet am (optional)<input type="date" name="ends" min="${isoDay(new Date())}"></label>
      <button class="btn" type="submit">Umfrage veröffentlichen</button>
      <p class="meta">Alle Eltern in der KitaCloud können die Umfrage sehen und abstimmen.</p>
    </form>`);
  const form = document.getElementById('poll-form');
  const answers = document.getElementById('answers');
  const slots = document.getElementById('slots');
  const kind = () => form.elements.kind.value;
  const addAnswer = () => {
    const n = answers.children.length + 1;
    answers.insertAdjacentHTML('beforeend', `<input name="answer" maxlength="200" placeholder="Antwort ${n}">`);
  };
  const addSlot = () => {
    // Neue Zeile übernimmt die Uhrzeiten der vorigen, das spart Tipparbeit
    const prev = slots.lastElementChild;
    slots.insertAdjacentHTML('beforeend', `<div class="slot-input">
      <input type="date" name="day" min="${isoDay(new Date())}" aria-label="Tag">
      <div class="two"><input type="time" name="from" aria-label="von" value="${prev ? prev.querySelector('[name=from]').value : ''}">
        <input type="time" name="to" aria-label="bis" value="${prev ? prev.querySelector('[name=to]').value : ''}"></div>
    </div>`);
  };
  [1, 2, 3].forEach(addAnswer);
  [1, 2].forEach(addSlot);
  form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', () => {
    form.querySelectorAll('[data-kind]').forEach((el) => { el.hidden = el.dataset.kind !== kind(); });
    document.getElementById('more').textContent = kind() === 'date' ? '＋ weitere Zeit' : '＋ weitere Antwort';
    form.elements.title.placeholder = kind() === 'date' ? 'z. B. Wann passt euch der Elternabend?' : 'z. B. Wer bringt was zum Sommerfest mit?';
  }));
  document.getElementById('more').addEventListener('click', () => {
    if (kind() === 'date') { addSlot(); slots.lastElementChild.querySelector('input').focus(); } else { addAnswer(); answers.lastElementChild.focus(); }
  });
  slots.addEventListener('change', (ev) => {
    if (ev.target.name !== 'from' || !ev.target.value) return;
    const to = ev.target.closest('.slot-input').querySelector('[name=to]');
    if (!to.value || to.value <= ev.target.value) to.value = addMinutes(ev.target.value, 60);
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const poll = {
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      ends: form.elements.ends.value ? localDate(form.elements.ends.value, '23:59') : null,
    };
    if (kind() === 'date') {
      const dates = [];
      for (const row of slots.children) {
        const day = row.querySelector('[name=day]').value;
        const from = row.querySelector('[name=from]').value, to = row.querySelector('[name=to]').value;
        if (!day) continue;
        if (!from) {
          const start = localDate(day, '00:00');
          dates.push({ start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) });
        } else {
          if (to && to <= from) return alert('Bei einer Zeit ist „bis“ früher als „von“.');
          dates.push({ start: localDate(day, from), end: to ? localDate(day, to) : null });
        }
      }
      if (dates.length < 2) return alert('Bitte mindestens zwei Zeiten eintragen.');
      dates.sort((a, b) => a.start - b.start);
      Object.assign(poll, { dates, allowMaybe: form.elements.maybe.checked });
    } else {
      const options = [...form.querySelectorAll('[name=answer]')].map((i) => i.value.trim()).filter(Boolean);
      if (options.length < 2) return alert('Bitte mindestens zwei Antworten eintragen.');
      Object.assign(poll, { options: [...new Set(options)], multi: form.elements.multi.checked, allowProposals: form.elements.proposals.checked });
    }
    const id = await submitting(form, () => api.createPoll(poll), 'Die Umfrage konnte nicht angelegt werden.');
    location.replace('#/umfragen/' + encodeURIComponent(id));
  });
}

// ---------- Kontakte (Elternliste) ----------
// Funktion statt const: render() läuft schon, bevor dieser Teil des Skripts ausgeführt ist
function loadContacts() {
  return (loadContacts.cache ||= api.contacts().catch((e) => { loadContacts.cache = null; throw e; }));
}

async function viewKontakte() {
  show('Elternliste', '<p class="empty">Lädt …</p>');
  const contacts = (await loadContacts()).slice().sort((a, b) => a.sortName.localeCompare(b.sortName, 'de'));
  if (!contacts.length) return show('Elternliste', '<p class="empty">Keine Kontakte gefunden.</p>');
  show('Elternliste', `
    <input class="search" type="search" id="search" placeholder="Name oder Kind suchen" autocomplete="off">
    <div id="contact-list"></div>`);
  const list = document.getElementById('contact-list');
  const draw = (q) => {
    const needle = q.trim().toLowerCase();
    const hits = contacts.filter((c) => !needle || [c.name, c.note, c.org, ...c.categories].join(' ').toLowerCase().includes(needle));
    let letter = '';
    list.innerHTML = hits.map((c) => {
      const head = c.letter !== letter ? `${letter ? '</div>' : ''}<div class="month">${esc(c.letter)}</div><div class="list">` : '';
      letter = c.letter;
      return head + `
        <a class="row" href="#/kontakte/${encodeURIComponent(c.id)}">
          <div class="avatar">${esc(initials(c.name))}</div>
          <div class="grow"><div class="title">${esc(c.name)}</div>${c.note || c.org ? `<div class="meta ellipsis">${esc(c.note || c.org)}</div>` : ''}</div>
          <span class="chev">›</span>
        </a>`;
    }).join('') + (hits.length ? '</div>' : '<p class="empty">Niemand gefunden.</p>');
  };
  document.getElementById('search').addEventListener('input', (ev) => draw(ev.target.value));
  draw('');
}

async function viewKontakt(id) {
  show('Kontakt', '<p class="empty">Lädt …</p>');
  const c = (await loadContacts()).find((x) => x.id === id);
  if (!c) return show('Kontakt', '<p class="empty">Kontakt nicht gefunden.</p>');
  const typeName = (t) => ({ cell: 'Mobil', home: 'Privat', work: 'Arbeit' })[t.split(',')[0]] || '';
  const line = (href, icon, value, type) => `
    <a class="row" href="${esc(href)}">
      <div style="font-size:22px">${icon}</div>
      <div class="grow"><div class="title">${esc(value)}</div>${type ? `<div class="meta">${esc(type)}</div>` : ''}</div>
    </a>`;
  show('Kontakt', `
    <div class="contact-head">
      <div class="avatar big">${esc(initials(c.name))}</div>
      <h1>${esc(c.name)}</h1>
      ${c.note ? `<div class="meta">${esc(c.note)}</div>` : ''}
      ${c.categories.map((t) => `<span class="tag closed">${esc(t)}</span>`).join('')}
    </div>
    ${c.phones.length ? `<div class="list">${c.phones.map((p) => line('tel:' + p.value.replace(/[^\d+]/g, ''), '📞', p.value, p.label || typeName(p.type))).join('')}</div>` : ''}
    ${c.phones.some((p) => /cell/.test(p.type)) ? `<div class="list">${c.phones.filter((p) => /cell/.test(p.type)).map((p) => line('sms:' + p.value.replace(/[^\d+]/g, ''), '💬', 'SMS schreiben', [p.label, p.value].filter(Boolean).join(' · '))).join('')}</div>` : ''}
    ${c.emails.length ? `<div class="list">${c.emails.map((e) => line('mailto:' + e.value, '✉️', e.value, e.label || typeName(e.type))).join('')}</div>` : ''}
    ${c.addresses.length ? `<div class="list">${c.addresses.map((a) => line('https://maps.apple.com/?q=' + encodeURIComponent(a.value), '📍', a.value, typeName(a.type))).join('')}</div>` : ''}
    ${c.org ? `<p class="meta">${esc(c.org)}</p>` : ''}
    <button class="btn secondary" id="save-contact" style="width:100%;margin-top:8px">In meinen Handy-Kontakten speichern</button>`);
  document.getElementById('save-contact').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toVcard(c)], { type: 'text/vcard' }));
    a.download = c.name.replace(/[^\wäöüÄÖÜß -]/g, '') + '.vcf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  });
}

function toVcard(c) {
  const e = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${e(c.name)}`,
    ...c.phones.map((p) => `TEL${p.type ? ';TYPE=' + p.type.toUpperCase() : ''}:${p.value}`),
    ...c.emails.map((m) => `EMAIL:${m.value}`),
    ...c.addresses.map((a) => `ADR:;;${e(a.value)};;;;`),
    ...(c.note ? [`NOTE:${e(c.note)}`] : []),
    'END:VCARD'].join('\r\n') + '\r\n';
}

function initials(name) {
  return name.replace(/^Familie\s+/i, '').split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// ---------- Handbuch (Collectives) ----------
// ---------- Versionen und Neuigkeiten ----------
function whatsNewCard() {
  if (recall('kita-seen-version') === APP_VERSION) return '';
  const r = RELEASES[0];
  return `
    <div class="card green" id="new-card">
      <h3>🆕 Neu in Version ${esc(r.version)}</h3>
      <ul class="notes">${r.notes.slice(0, 3).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <div class="actions">
        <a class="btn secondary" href="#/neu">Alles ansehen</a>
        <button class="btn secondary" id="new-ok">Okay</button>
      </div>
    </div>`;
}

function bindWhatsNewCard() {
  document.getElementById('new-ok')?.addEventListener('click', () => {
    remember('kita-seen-version', APP_VERSION);
    document.getElementById('new-card')?.remove();
  });
}

function viewNeu() {
  remember('kita-seen-version', APP_VERSION);
  show('Was ist neu?', RELEASES.map((r) => `
    <h2 class="section">Version ${esc(r.version)} <span class="meta">· ${esc(fmtDate(new Date(r.date + 'T00:00:00'), { day: 'numeric', month: 'long', year: 'numeric' }))}</span></h2>
    <ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`).join(''));
}

async function viewHandbuch() {
  show('Handbuch', '<p class="empty">Lädt …</p>');
  const pages = await api.pages();
  show('Handbuch', `
    <div class="list">${pages.map((p) => `
      <a class="row" href="#/handbuch/${encodeURIComponent(p.id)}">
        <div style="font-size:24px">${esc(p.emoji)}</div>
        <div class="grow"><div class="title">${esc(p.title)}</div>${p.teaser ? `<div class="meta">${esc(p.teaser)}</div>` : ''}</div>
        <span class="chev">›</span>
      </a>`).join('')}</div>
    <p class="meta" style="margin-top:16px">KiTa-App ${esc(APP_VERSION)} · <a href="#/neu">Was ist neu?</a></p>`);
}

async function viewSeite(id) {
  show('Handbuch', '<p class="empty">Lädt …</p>');
  const p = await api.page(id);
  if (!p) return show('Handbuch', '<p class="empty">Seite nicht gefunden.</p>');
  show(p.title, `<article class="page">${markdown(p.body, { img: (src) => api.pageImage(p, src) })}</article>
    ${p.updated ? `<p class="meta">Zuletzt geändert ${fmtRelative(p.updated)}</p>` : ''}`);
  $view.querySelectorAll('.page img').forEach((img) => img.addEventListener('click', () => {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<button class="close" aria-label="Schließen">✕</button><img src="${img.src}" alt="">`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  }));
}

// ---------- Suche (Handbuch und Elternliste) ----------
// Ohne Umlaute und Großschreibung vergleichen, damit „kuendigung“ und „Kündigung“ beide treffen
const fold = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function plainText(md) {
  return String(md || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[ \t]*(?:[#>*+-]+|\d+\.)[ \t]+/gm, '')
    .replace(/[*_`|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Treffer in einem Text markieren (nur wenn die Faltung die Länge nicht ändert, sonst ohne Markierung)
function markHtml(part, terms) {
  const fp = fold(part);
  const marks = new Array(part.length).fill(false);
  if (fp.length === part.length) {
    terms.forEach((t) => { for (let i = fp.indexOf(t); i >= 0 && t; i = fp.indexOf(t, i + t.length)) for (let k = 0; k < t.length; k++) marks[i + k] = true; });
  }
  let out = '';
  for (let i = 0; i < part.length;) {
    let j = i;
    while (j < part.length && marks[j] === marks[i]) j++;
    out += marks[i] ? `<mark>${esc(part.slice(i, j))}</mark>` : esc(part.slice(i, j));
    i = j;
  }
  return out;
}

function snippet(text, terms) {
  const f = fold(text);
  const at = terms.map((t) => f.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const from = Math.max(0, at - 40);
  const part = text.slice(from, from + 130);
  return (from > 0 ? '… ' : '') + markHtml(part, terms) + (from + 130 < text.length ? ' …' : '');
}

async function viewSuche() {
  show('Suche', `
    <input class="search" type="search" id="q" placeholder="Handbuch und Elternliste durchsuchen" autocomplete="off" enterkeyhint="search">
    <div id="results"><p class="meta">Mindestens zwei Buchstaben eingeben.</p></div>`);
  const input = document.getElementById('q');
  const box = document.getElementById('results');
  input.focus();
  let pages = null;
  let contacts = [];
  loadContacts().then((c) => { contacts = c; run(); }).catch(() => {});
  api.searchPages().then((p) => {
    pages = p.map((x) => {
      // Der Seitentitel steht oft als erste Zeile im Text, im Ausschnitt nicht wiederholen
      let text = plainText(x.body);
      const leaf = x.title.split(' › ').pop();
      if (text.toLowerCase().startsWith(leaf.toLowerCase())) text = text.slice(leaf.length).trim();
      return { ...x, text, f: fold(x.title + ' ' + text) };
    });
    run();
  }).catch(() => { pages = []; run(); });
  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });

  function run() {
    const terms = fold(input.value).split(/\s+/).filter((t) => t.length >= 1);
    if (fold(input.value).trim().length < 2) { box.innerHTML = '<p class="meta">Mindestens zwei Buchstaben eingeben.</p>'; return; }
    const hitsPages = (pages || []).map((p) => {
      if (!terms.every((t) => p.f.includes(t))) return null;
      const inTitle = terms.every((t) => fold(p.title).includes(t));
      return { p, score: (inTitle ? 1000 : 0) + terms.reduce((n, t) => n + p.f.split(t).length - 1, 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 15);
    const hitsContacts = contacts.filter((c) => {
      const f = fold([c.name, c.note, c.org, ...c.categories].join(' '));
      return terms.every((t) => f.includes(t));
    }).slice(0, 15);
    box.innerHTML = `
      <h2 class="section">Handbuch</h2>
      ${pages === null ? '<p class="meta">Wird durchsucht …</p>' : hitsPages.length ? `<div class="list">${hitsPages.map(({ p }) => `
        <a class="row" href="#/handbuch/${encodeURIComponent(p.id)}">
          <div class="grow"><div class="title">${markHtml(p.title, terms)}</div><div class="meta">${snippet(p.text, terms)}</div></div>
          <span class="chev">›</span></a>`).join('')}</div>` : '<p class="meta">Nichts gefunden.</p>'}
      <h2 class="section">Elternliste</h2>
      ${hitsContacts.length ? `<div class="list">${hitsContacts.map((c) => `
        <a class="row" href="#/kontakte/${encodeURIComponent(c.id)}">
          <div class="avatar">${esc(initials(c.name))}</div>
          <div class="grow"><div class="title">${esc(c.name)}</div>${c.note || c.org ? `<div class="meta ellipsis">${esc(c.note || c.org)}</div>` : ''}</div>
          <span class="chev">›</span></a>`).join('')}</div>` : '<p class="meta">Nichts gefunden.</p>'}`;
  }
}

// ---------- Hilfsfunktionen ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function linkify(html) {
  return html.replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

// Links zwischen Handbuch-Seiten zeigen in Collectives auf ".../Seitentitel-1234" oder "?fileId=1234"
function pageLink(href) {
  const m = href.match(/[?&]fileId=(\d+)/) || (/^https?:/.test(href) && !href.includes('/apps/collectives/') ? null : href.match(/-(\d+)(?:[?#].*)?$/));
  return m ? `#/handbuch/${m[1]}` : href;
}

// Kleiner Markdown-Renderer für Collectives-Seiten
function markdown(src, { img = (s) => s } = {}) {
  const inline = (t) => esc(t)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (all, alt, s) => `<img src="${esc(img(s.replace(/&amp;/g, '&')))}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => {
      const target = pageLink(href.replace(/&amp;/g, '&'));
      return `<a href="${esc(target)}"${target.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${text}</a>`;
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let list = null, table = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
    const cells = (r) => r.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim());
    const all = rows.map(cells).filter((r) => r.some(Boolean)); // leere Kopfzeilen (wie im Willkommen-Text) weglassen
    out.push(`<div class="table-wrap"><table>${all.map((r, i) => `<tr>${r.map((c) => `<${i ? 'td' : 'th'}>${inline(c)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table></div>`);
    table = null;
  };
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (/^\s*\|/.test(line)) { closeList(); (table = table || []).push(line); continue; }
    closeTable();
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { closeList(); const l = Math.min(m[1].length, 3); out.push(`<h${l}>${inline(m[2])}</h${l}>`); }
    else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { closeList(); out.push('<hr>'); }
    else if ((m = line.match(/^\s*[-*+]\s+(?:\[[ x]\]\s*)?(.*)/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^>\s?(.*)/))) { closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (line.trim()) { closeList(); out.push(`<p>${inline(line)}</p>`); }
    else closeList();
  }
  closeList(); closeTable();
  return out.join('\n');
}
function stripMd(s) {
  return s.replace(/^#+\s*/, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|\*|`/g, '').trim();
}
function shorten(s, n) { return s.length > n ? s.slice(0, n).replace(/\s\S*$/, '') + ' …' : s; }
function firstParagraph(md) {
  const p = md.split('\n').find((l) => l.trim() && !/^(#|>|[-*]\s|\d+\.|!\[|\|)/.test(l.trim())) || '';
  return shorten(stripMd(p), 140);
}

function greeting() { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend'; }
function isoDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function localDate(day, time) { const [y, m, d] = day.split('-'); const [h, mi] = time.split(':'); return new Date(+y, m - 1, +d, +h, +mi); }
function addMinutes(time, n) { const [h, m] = time.split(':').map(Number); const t = Math.min(h * 60 + m + n, 23 * 60 + 55); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
function fmtDate(d, opts) { return d.toLocaleDateString('de-DE', opts); }
function fmtTime(d) { return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
function daysUntil(d) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 864e5);
}
function fmtDay(d) {
  const n = daysUntil(d);
  return n === 0 ? 'Heute' : n === -1 ? 'Gestern' : fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtRelative(d) {
  const n = daysUntil(d);
  if (n === 0) return 'heute';
  if (n === 1) return 'morgen';
  if (n === -1) return 'gestern';
  if (n > 1 && n < 7) return `in ${n} Tagen`;
  if (n < -1 && n > -7) return `vor ${-n} Tagen`;
  return 'am ' + fmtDate(d, { day: 'numeric', month: 'short' });
}
