/* Thought Board · dashboard UI. Loaded after config.js and core.js. */
(function () {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const { esc } = M;

/* ───────────── State ───────────── */
const PREFS_KEY = 'thoughtboard.prefs';
const state = { items: [], q: '', editingId: null, shareId: null, view: 'board', board: 'pipeline', filter: 'all' };
try { Object.assign(state, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch { /* ignore */ }
const savePrefs = () => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ view: state.view, board: state.board, filter: state.filter })); } catch { /* ignore */ }
};
let store;

/* ───────────── Kanban boards ─────────────
   Each board decides which items appear, which column each sits in,
   and what changes when a card is dropped into a column.            */
const BOARDS = {
  pipeline: {
    hint: 'Thoughts move left → right. Once the decision is Proceed they move to the Projects boards.',
    include: (t) => !M.isProject(t),
    columns: M.STAGES,
    key: (t) => t.stage,
    move: (t, col) => (col === 'decision' ? { stage: col } : { stage: col, decision: null }),
  },
  decision: {
    hint: 'Drop a thought on Proceed to turn it into a Project.',
    include: (t) => t.stage === 'decision',
    columns: [{ id: '', label: 'Awaiting decision' }, ...M.DECISIONS],
    key: (t) => t.decision || '',
    move: (t, col) => M.decisionPatch(t, col),
  },
  status: {
    hint: 'Projects by status.',
    include: M.isProject,
    columns: M.STATUSES,
    key: (t) => t.status || 'not_started',
    move: (t, col) => ({ status: col }),
  },
  priority: {
    hint: 'Projects by priority.',
    include: M.isProject,
    columns: M.PRIORITIES,
    key: (t) => t.priority || 'medium',
    move: (t, col) => ({ priority: col }),
  },
};

/* ───────────── Boot (called at the end of this file) ───────────── */
async function boot() {
  document.title = CONFIG.APP_NAME;
  $$('.app-name').forEach((el) => (el.textContent = CONFIG.APP_NAME));
  wire();
  store = await createStore();
  if (store.mode === 'supabase' && !(await store.session())) return showAuth();
  await enterApp();
}

function showAuth() { $('#auth').hidden = false; $('#app').hidden = true; }

async function enterApp() {
  $('#auth').hidden = true; $('#app').hidden = false;
  $('#modeNote').textContent = store.mode === 'local' ? 'Local mode · saved in this browser only' : '';
  $('#signoutItem').hidden = store.mode === 'local';
  try { state.items = await store.list(); } catch (e) { toast(e.message, true); }
  render();
  M.fxRefresh().then(render).catch(() => {});
}

/* ───────────── Rendering ───────────── */
function render() {
  renderToolbar();
  renderSummary();
  if (state.view === 'list') renderList(); else renderBoard();
}

function renderToolbar() {
  $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  $$('#boardSeg button').forEach((b) => b.classList.toggle('on', b.dataset.board === state.board));
  $$('#filterSeg button').forEach((b) => b.classList.toggle('on', b.dataset.filter === state.filter));
  $('#boardSeg').hidden = state.view !== 'board';
  $('#filterSeg').hidden = state.view !== 'list';
}

function renderSummary() {
  const all = state.items;
  const projects = all.filter(M.isProject);
  const open = all.filter((t) => !M.isProject(t) && t.decision !== 'dropped').length;
  const cost = projects.reduce((s, t) => s + (+t.planned_cost || 0), 0);
  const stats = [
    ['Open thoughts', open],
    ['Projects', projects.length],
    ['In progress', projects.filter((t) => t.status === 'wip').length],
    ['Completed', projects.filter((t) => t.status === 'completed').length],
    ['Planned cost · projects', M.fmtPrimary(cost), M.fmtSecondary(cost)],
  ];
  $('#summary').innerHTML = stats.map(([k, v, sub]) =>
    `<div class="stat"><span class="stat-k">${esc(k)}</span><span class="stat-v">${esc(v)}${sub ? ` <small class="stat-sub">(${esc(sub)})</small>` : ''}</span></div>`).join('');
  renderFx();
}

/* ───────────── Exchange rate ───────────── */
function renderFx() {
  const note = $('#fxNote');
  if (note) note.textContent = M.fxLabel();
}

function openFx() {
  $('#fxCurrent').textContent = M.fxLabel();
  $('#fxMode').textContent = M.fx.manual
    ? 'You set this rate yourself. It stays fixed until you change it or go back to automatic.'
    : 'Updated automatically from free daily reference rates (European Central Bank). It may differ slightly from XE.';
  $('#fxXe').href = M.XE_URL;
  $('#fxManual').value = M.fx.manual && M.fx.rate ? M.fx.rate : '';
  $('#fxAutoRow').hidden = !M.fx.manual;
  if (!$('#fxDlg').open) $('#fxDlg').showModal();
}

async function onFxAction(e) {
  const b = e.target.closest('[data-fx]');
  if (!b) return;
  b.disabled = true;
  try {
    if (b.dataset.fx === 'manual') {
      const v = parseFloat($('#fxManual').value);
      if (!(v > 0)) { toast('Enter the ₹ amount for £1, e.g. 112.50', true); return; }
      await M.fxSetManual(v); toast('Using your rate');
    } else if (b.dataset.fx === 'auto') {
      await M.fxSetManual(null); toast(M.fx.manual ? 'Could not fetch the rate' : 'Back to automatic rate');
    } else {
      if (M.fx.manual) await M.fxSetManual(null); else await M.fxRefresh(true);
      toast(M.fx.rate ? 'Rate updated' : 'Could not fetch the rate — check your connection', !M.fx.rate);
    }
    render(); openFx();
  } finally { b.disabled = false; }
}

function matches(t) {
  const q = state.q.trim().toLowerCase();
  if (!q) return true;
  return [t.title, t.description, t.objective, t.expected_benefit].some((s) => (s || '').toLowerCase().includes(q));
}

function emptyState() {
  return `<div class="empty">
    <div class="empty-sq" aria-hidden="true"></div>
    <h2>No thoughts yet</h2>
    <p>Capture the first idea — you can grow it into a project later.</p>
    <button class="btn primary" type="button" data-act="new">＋ New thought</button>
  </div>`;
}

function cardHtml(t, board) {
  const dev = M.safeUrl(t.dev_link);
  const dates = M.dateLine(t);
  const cost = M.fmtMoney(t.planned_cost);
  return `<article class="card${M.isProject(t) ? ' is-project' : ''}" draggable="true" data-id="${esc(t.id)}" tabindex="0">
    <div class="card-head">
      ${M.iconHtml(t)}
      <div class="card-title">
        <h3>${esc(t.title)}</h3>
        <div class="chips">${M.chipsHtml(t, { hideStage: board === 'pipeline' })}</div>
      </div>
    </div>
    ${t.description ? `<p class="card-desc">${esc(t.description)}</p>` : ''}
    ${dates || cost ? `<div class="card-meta">${dates ? `<span>${esc(dates)}</span>` : ''}${cost ? `<span class="cost">${esc(cost)}</span>` : ''}</div>` : ''}
    <div class="card-foot">
      ${dev ? `<a class="mini" href="${esc(dev)}" target="_blank" rel="noopener" title="Open development link">↗ Dev link</a>` : '<span></span>'}
      <button type="button" class="mini${t.share_token ? ' shared' : ''}" data-act="share" title="Share">${t.share_token ? '● Shared' : 'Share'}</button>
    </div>
  </article>`;
}

function renderBoard() {
  const main = $('#main');
  if (!state.items.length) { main.innerHTML = emptyState(); return; }
  const b = BOARDS[state.board] || BOARDS.pipeline;
  const items = state.items.filter((t) => b.include(t) && matches(t));
  main.innerHTML = `<p class="board-hint">${esc(b.hint)}</p>
  <div class="board" style="--cols:${b.columns.length}">
    ${b.columns.map((col) => {
      const cards = items.filter((t) => b.key(t) === col.id);
      return `<section class="col">
        <header class="col-head"><h2>${esc(col.label)}</h2><span class="count">${cards.length}</span></header>
        <div class="col-body" data-drop="${esc(col.id)}">
          ${cards.map((t) => cardHtml(t, state.board)).join('') || '<div class="col-empty">Drop here</div>'}
        </div>
      </section>`;
    }).join('')}
  </div>`;
}

function renderList() {
  const main = $('#main');
  if (!state.items.length) { main.innerHTML = emptyState(); return; }
  let items = state.items.filter(matches);
  if (state.filter === 'thoughts') items = items.filter((t) => !M.isProject(t));
  if (state.filter === 'projects') items = items.filter(M.isProject);
  main.innerHTML = `<div class="table-wrap"><table class="list">
    <thead><tr>
      <th>Title</th><th>Stage / Status</th><th>Start</th><th class="num">Weeks</th><th>End</th>
      <th class="num">Planned cost</th><th>Dev link</th><th></th>
    </tr></thead>
    <tbody>${items.map((t) => {
      const dev = M.safeUrl(t.dev_link);
      return `<tr data-id="${esc(t.id)}" tabindex="0">
        <td><div class="t-title">${M.iconHtml(t, 'sm')}<span>${esc(t.title)}</span></div></td>
        <td><div class="chips">${M.chipsHtml(t)}</div></td>
        <td>${esc(M.fmtDate(t.start_date))}</td>
        <td class="num">${esc(t.duration_weeks ?? '')}</td>
        <td>${esc(M.fmtDate(t.end_date))}</td>
        <td class="num">${esc(M.fmtMoney(t.planned_cost))}</td>
        <td>${dev ? `<a class="mini" href="${esc(dev)}" target="_blank" rel="noopener">↗ Open</a>` : ''}</td>
        <td><button type="button" class="mini${t.share_token ? ' shared' : ''}" data-act="share">${t.share_token ? '● Shared' : 'Share'}</button></td>
      </tr>`;
    }).join('') || '<tr class="none"><td colspan="8">Nothing matches.</td></tr>'}</tbody>
  </table></div>`;
}

/* ───────────── Saving ───────────── */
const find = (id) => state.items.find((x) => x.id === id);
function replaceItem(row) {
  const i = state.items.findIndex((x) => x.id === row.id);
  if (i >= 0) state.items[i] = row; else state.items.unshift(row);
}

async function patchItem(id, patch, msg) {
  const before = find(id);
  try {
    const row = await store.update(id, patch);
    replaceItem(row);
    render();
    if (msg) toast(msg);
    else if (!M.isProject(before) && M.isProject(row)) toast('Promoted to Project');
  } catch (e) { toast(e.message, true); }
}

/* ───────────── Editor ───────────── */
const F = $('#form');
const fe = (n) => F.elements.namedItem(n);

function openEditor(id) {
  const t = id ? find(id) : M.blank();
  if (!t) return;
  state.editingId = id || null;
  for (const n of ['title', 'icon', 'stage', 'decision', 'priority', 'status', 'start_date',
    'duration_weeks', 'description', 'objective', 'expected_benefit', 'planned_cost', 'dev_link']) {
    fe(n).value = t[n] ?? '';
  }
  if (!fe('stage').value) fe('stage').value = 'initial';
  $('#drawerTitle').textContent = id ? t.title || 'Edit' : 'New thought';
  $('#deleteBtn').hidden = !id;
  $('#shareFromForm').hidden = !id;
  syncForm();
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
  setTimeout(() => fe('title').focus(), 50);
}

function closeEditor() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
  state.editingId = null;
}

function syncForm() {
  const isDecision = fe('stage').value === 'decision';
  $('#decisionField').hidden = !isDecision;
  const proj = isDecision && fe('decision').value === 'proceed';
  fe('priority').disabled = !proj;
  fe('status').disabled = !proj;
  if (proj) {
    if (!fe('priority').value) fe('priority').value = 'medium';
    if (!fe('status').value) fe('status').value = 'not_started';
  }
  $('#projectBox').classList.toggle('inactive', !proj);
  $('#projectHint').hidden = proj;
  const badge = $('#typeBadge');
  badge.textContent = proj ? 'Project' : 'Thought';
  badge.className = 'chip' + (proj ? ' accent' : '');

  const end = M.endDate(fe('start_date').value, fe('duration_weeks').value);
  fe('end_date').value = end ? M.fmtDate(end) : '';

  $$('.counter', F).forEach((c) => {
    const n = M.wordCount(fe(c.dataset.for).value);
    c.textContent = `${n} / ${M.WORD_LIMIT} words`;
    c.classList.toggle('over', n > M.WORD_LIMIT);
  });
  $('#iconPreview').innerHTML = M.iconHtml({ icon: fe('icon').value, title: fe('title').value }, 'lg');
  const sec = M.fmtSecondary(fe('planned_cost').value);
  $('#costSecondary').textContent = sec ? `≈ ${sec}` : '';
}

function readForm() {
  const v = (n) => fe(n).value.trim();
  const num = (n) => (v(n) === '' ? null : Number(v(n)));
  const stage = v('stage') || 'initial';
  const d = {
    title: v('title'),
    icon: v('icon'),
    stage,
    decision: stage === 'decision' ? v('decision') || null : null,
    priority: v('priority') || null,
    status: v('status') || null,
    start_date: v('start_date') || null,
    duration_weeks: num('duration_weeks'),
    description: v('description'),
    objective: v('objective'),
    expected_benefit: v('expected_benefit'),
    planned_cost: num('planned_cost'),
    dev_link: M.normaliseUrl(v('dev_link')),
  };
  d.end_date = M.endDate(d.start_date, d.duration_weeks);
  return d;
}

function validate(d) {
  if (!d.title) return 'Please give it a title.';
  if (M.wordCount(d.description) > M.WORD_LIMIT) return `Description is over ${M.WORD_LIMIT} words.`;
  if (M.wordCount(d.objective) > M.WORD_LIMIT) return `Objective is over ${M.WORD_LIMIT} words.`;
  if (d.dev_link && !M.safeUrl(d.dev_link)) return 'Development link must be a web address.';
  if (d.duration_weeks !== null && (d.duration_weeks < 0 || !Number.isFinite(d.duration_weeks))) return 'Duration must be 0 or more weeks.';
  if (d.planned_cost !== null && (d.planned_cost < 0 || !Number.isFinite(d.planned_cost))) return 'Planned cost must be 0 or more.';
  return null;
}

async function onSave(e) {
  e.preventDefault();
  const d = readForm();
  const err = validate(d);
  if (err) return toast(err, true);
  const btn = F.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    const id = state.editingId;
    const wasProject = id && M.isProject(find(id));
    const row = id ? await store.update(id, d) : await store.create(d);
    replaceItem(row);
    closeEditor();
    render();
    toast(!wasProject && M.isProject(row) ? 'Saved · promoted to Project' : 'Saved');
  } catch (ex) { toast(ex.message, true); } finally { btn.disabled = false; }
}

async function onDelete() {
  const t = find(state.editingId);
  if (!t) return;
  if (!(await confirmAsk(`Delete “${t.title}”? This cannot be undone.`))) return;
  try {
    await store.remove(t.id);
    state.items = state.items.filter((x) => x.id !== t.id);
    closeEditor(); render(); toast('Deleted');
  } catch (e) { toast(e.message, true); }
}

/* ───────────── Sharing ───────────── */
const shareUrl = (token) => new URL(`share.html?t=${encodeURIComponent(token)}`, location.href).href;

function openShare(id) {
  state.shareId = id;
  renderShare();
  $('#shareDlg').showModal();
}

function renderShare() {
  const t = find(state.shareId);
  const body = $('#shareBody');
  if (!t) { body.innerHTML = ''; return; }
  if (store.mode === 'local') {
    body.innerHTML = `<p>Sharing needs the free online database, because a shared link must be readable from another person's device.</p>
      <p class="muted">Follow step 3 in the README to connect Supabase — it takes about 10 minutes.</p>`;
    return;
  }
  if (!t.share_token) {
    body.innerHTML = `<p>Create a read-only link for <b>${esc(t.title)}</b>.</p>
      <p class="muted">People with the link see only this item — nothing else on your board.</p>
      <div class="dlg-actions"><button type="button" class="btn primary" data-share="on">Create link</button></div>`;
    return;
  }
  const url = shareUrl(t.share_token);
  body.innerHTML = `<p>Anyone with this link can view <b>${esc(t.title)}</b> (read only).</p>
    <div class="copy-row"><input readonly value="${esc(url)}" aria-label="Share link"><button type="button" class="btn primary" data-share="copy">Copy</button></div>
    <div class="dlg-actions">
      <a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener">Open</a>
      <button type="button" class="btn danger-ghost" data-share="off">Stop sharing</button>
    </div>
    <p class="muted small">Stopping invalidates this link. Creating a new one later gives a different link.</p>`;
}

async function onShareAction(e) {
  const b = e.target.closest('[data-share]');
  if (!b) return;
  const id = state.shareId;
  if (b.dataset.share === 'copy') {
    const input = $('#shareBody input');
    try { await navigator.clipboard.writeText(input.value); toast('Link copied'); }
    catch { input.select(); document.execCommand('copy'); toast('Link copied'); }
    return;
  }
  b.disabled = true;
  try {
    const row = await store.setShare(id, b.dataset.share === 'on');
    replaceItem(row); render(); renderShare();
  } catch (ex) { toast(ex.message, true); b.disabled = false; }
}

/* ───────────── Backup ───────────── */
function exportJson() {
  const blob = new Blob([JSON.stringify({ app: 'thought-board', version: 1, exported_at: new Date().toISOString(), items: state.items }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `thought-board-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    const items = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(items)) throw new Error('Not a Thought Board backup file.');
    let n = 0;
    for (const it of items) {
      if (!it || !it.title) continue;
      const { id, share_token, ...rest } = it; // new ids, sharing off
      replaceItem(await store.create(rest)); n++;
    }
    render(); toast(`Imported ${n} item${n === 1 ? '' : 's'}`);
  } catch (e) { toast(e.message, true); }
}

/* ───────────── Small UI helpers ───────────── */
let toastTimer;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 4500 : 2200);
}

function confirmAsk(msg) {
  const dlg = $('#confirmDlg');
  $('#confirmMsg').textContent = msg;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue === 'yes'), { once: true }));
}

/* ───────────── Wiring ───────────── */
function wire() {
  // Login
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget; const err = $('#loginErr');
    err.hidden = true;
    try { await store.signIn(f.email.value.trim(), f.password.value); await enterApp(); }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  // Toolbar
  $('#viewSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; savePrefs(); render(); } });
  $('#boardSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-board]'); if (b) { state.board = b.dataset.board; savePrefs(); render(); } });
  $('#filterSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) { state.filter = b.dataset.filter; savePrefs(); render(); } });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; state.view === 'list' ? renderList() : renderBoard(); });
  $('#newBtn').addEventListener('click', () => openEditor());

  // Menu
  const menu = $('#menu');
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => (menu.hidden = true));
  menu.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    menu.hidden = true;
    if (b.dataset.menu === 'export') exportJson();
    if (b.dataset.menu === 'import') $('#importFile').click();
    if (b.dataset.menu === 'signout') { await store.signOut(); location.reload(); }
    if (b.dataset.menu === 'fx') openFx();
  });
  $('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; });

  // Board / list interactions
  const main = $('#main');
  main.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      e.stopPropagation();
      if (act.dataset.act === 'new') openEditor();
      if (act.dataset.act === 'share') openShare(act.closest('[data-id]').dataset.id);
      return;
    }
    if (e.target.closest('a')) return;
    const item = e.target.closest('[data-id]');
    if (item) openEditor(item.dataset.id);
  });
  main.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-id]')) openEditor(e.target.dataset.id);
  });

  // Drag & drop between Kanban columns
  main.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.card'); if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  main.addEventListener('dragend', () => {
    $$('.card.dragging').forEach((c) => c.classList.remove('dragging'));
    $$('.col-body.over').forEach((c) => c.classList.remove('over'));
  });
  main.addEventListener('dragover', (e) => {
    const body = e.target.closest('.col-body'); if (!body) return;
    e.preventDefault();
    $$('.col-body.over').forEach((c) => c !== body && c.classList.remove('over'));
    body.classList.add('over');
  });
  main.addEventListener('drop', (e) => {
    const body = e.target.closest('.col-body'); if (!body) return;
    e.preventDefault();
    body.classList.remove('over');
    const t = find(e.dataTransfer.getData('text/plain'));
    const b = BOARDS[state.board];
    if (!t || !b || b.key(t) === body.dataset.drop) return;
    patchItem(t.id, b.move(t, body.dataset.drop));
  });

  // Editor
  F.addEventListener('input', syncForm);
  F.addEventListener('change', syncForm);
  F.addEventListener('submit', onSave);
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeEditor));
  $('#scrim').addEventListener('click', closeEditor);
  $('#deleteBtn').addEventListener('click', onDelete);
  $('#shareFromForm').addEventListener('click', () => openShare(state.editingId));
  $('#currencyNote').textContent = `in ${M.currencySymbol()}`;
  $('#fxNote').addEventListener('click', openFx);
  $('#fxDlg').addEventListener('click', onFxAction);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#drawer').classList.contains('open') && !document.querySelector('dialog[open]')) closeEditor();
  });

  // Share dialog
  $('#shareBody').addEventListener('click', onShareAction);
}

/* ───────────── Start ───────────── */
boot().catch((err) => { console.error(err); toast(err.message || String(err), true); });

})();
