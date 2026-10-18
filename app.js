/* Thought Board · dashboard UI. Loaded after config.js and core.js. */
(function () {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const { esc } = M;

/* ───────────── State ───────────── */
const PREFS_KEY = 'thoughtboard.prefs';
const state = {
  items: [], q: '', editingId: null, shareId: null, view: 'board', board: 'pipeline', filter: 'all',
  dash: { cat: '', start: '', from: '', to: '' },   // dashboard filters (Category, Start date)
  sort: { key: '', dir: 0 },                        // list sort: dir 1 = A→Z, -1 = Z→A
  colf: {},                                          // list column filters
};
try { Object.assign(state, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch { /* ignore */ }
state.dash = { cat: '', start: '', from: '', to: '', ...(state.dash || {}) };
state.sort = state.sort || { key: '', dir: 0 };
state.colf = {};
const savePrefs = () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      view: state.view, board: state.board, filter: state.filter, dash: state.dash, sort: state.sort,
    }));
  } catch { /* ignore */ }
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
    move: (t, col) => ({ status: col, percent_complete: M.percentFor(col, t.percent_complete) }),
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

/* ───────────── Dashboard filters (Category · Start date) ───────────── */
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function startRange(preset) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  switch (preset) {
    case 'past':       return [null, isoDay(new Date(y, m, now.getDate() - 1))];
    case 'this_month': return [isoDay(new Date(y, m, 1)), isoDay(new Date(y, m + 1, 0))];
    case 'next_3m':    return [isoDay(now), isoDay(new Date(y, m + 3, now.getDate()))];
    case 'this_year':  return [`${y}-01-01`, `${y}-12-31`];
    case 'next_year':  return [`${y + 1}-01-01`, `${y + 1}-12-31`];
    case 'custom':     return [state.dash.from || null, state.dash.to || null];
    default:           return [null, null];
  }
}
function passesDash(t) {
  const f = state.dash;
  if (f.cat === 'none' ? t.category : f.cat && t.category !== f.cat) return false;
  if (!f.start) return true;
  const sd = t.start_date ? String(t.start_date).slice(0, 10) : '';
  if (f.start === 'none') return !sd;
  if (!sd) return false;
  const [from, to] = startRange(f.start);
  return (!from || sd >= from) && (!to || sd <= to);
}
const dashActive = () => !!(state.dash.cat || state.dash.start);
const visible = () => state.items.filter(passesDash);

function renderFilters() {
  const f = state.dash;
  const cat = $('#fCat');
  if (!cat.options.length) {
    cat.innerHTML = '<option value="">All</option>'
      + M.CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')
      + '<option value="none">Uncategorised</option>';
  }
  cat.value = f.cat; $('#fStart').value = f.start;
  $('#fFrom').value = f.from; $('#fTo').value = f.to;
  $('#fRange').hidden = f.start !== 'custom';
  $('#fClear').hidden = !dashActive();
  cat.classList.toggle('active', !!f.cat); $('#fStart').classList.toggle('active', !!f.start);
}

function renderToolbar() {
  renderFilters();
  $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  $$('#boardSeg button').forEach((b) => b.classList.toggle('on', b.dataset.board === state.board));
  $$('#filterSeg button').forEach((b) => b.classList.toggle('on', b.dataset.filter === state.filter));
  $('#boardSeg').hidden = state.view !== 'board';
  $('#filterSeg').hidden = state.view !== 'list';
}

function renderSummary() {
  const all = visible();
  const projects = all.filter(M.isProject);
  const open = all.filter((t) => !M.isProject(t) && t.decision !== 'dropped').length;
  const cost = projects.reduce((s, t) => s + (+t.planned_cost || 0), 0);
  const actual = projects.reduce((s, t) => s + (+t.actual_cost || 0), 0);
  const sub = (n) => (M.fmtSecondary(n) ? `(${M.fmtSecondary(n)})` : '');
  const wip = projects.filter((t) => t.status === 'wip');
  const avg = wip.length ? Math.round(wip.reduce((s, t) => s + (+t.percent_complete || 0), 0) / wip.length) : null;
  // [label, value, sub-text, go-to target]
  const stats = [
    ['Open thoughts', open, '', 'pipeline'],
    ['Projects', projects.length, '', 'projects'],
    ['In progress', wip.length, avg !== null ? `avg ${avg}%` : '', 'wip'],
    ['Completed', projects.filter((t) => t.status === 'completed').length, '', 'completed'],
    ['Planned cost · projects', M.fmtPrimary(cost), sub(cost), ''],
    ['Actual cost · projects', M.fmtPrimary(actual), sub(actual), ''],
  ];
  $('#summary').innerHTML = stats.map(([k, v, sub, go]) => {
    const inner = `<span class="stat-k">${esc(k)}</span><span class="stat-v">${esc(v)}${sub ? ` <small class="stat-sub">${esc(sub)}</small>` : ''}</span>`;
    return go
      ? `<button type="button" class="stat link${isActiveGo(go) ? ' on' : ''}" data-go="${go}" title="Show ${esc(k.toLowerCase())}">${inner}</button>`
      : `<div class="stat">${inner}</div>`;
  }).join('');
  renderFx();
}

/* Summary tiles → board views */
const GO = {
  pipeline:  { board: 'pipeline' },
  projects:  { board: 'status' },
  wip:       { board: 'status', focus: 'wip' },
  completed: { board: 'status', focus: 'completed' },
};
function isActiveGo(go) {
  const g = GO[go];
  return state.view === 'board' && state.board === g.board && (state.focus || null) === (g.focus || null);
}
function goTo(go) {
  const g = GO[go]; if (!g) return;
  state.view = 'board'; state.board = g.board; state.focus = g.focus || null; state.q = '';
  $('#q').value = '';
  savePrefs(); render();
  const target = g.focus ? $(`.col-body[data-drop="${g.focus}"]`)?.closest('.col') : $('.board');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    if (g.focus) { target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1600); }
  }
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
  return [t.title, t.description, M.label(M.CATEGORIES, t.category)].some((s) => (s || '').toLowerCase().includes(q));
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
  const plan = M.fmtMoney(t.planned_cost);
  const act = M.fmtMoney(t.actual_cost);
  const created = M.fmtAdminDate(t.created_at);
  return `<article class="card${M.isProject(t) ? ' is-project' : ''}" draggable="true" data-id="${esc(t.id)}" tabindex="0">
    <div class="card-head">
      ${M.iconHtml(t)}
      <div class="card-title">
        ${t.category ? `<span class="card-cat">${esc(M.label(M.CATEGORIES, t.category))}</span>` : ''}
        <h3>${esc(t.title)}</h3>
        <div class="chips">${M.chipsHtml(t, { hideStage: board === 'pipeline' })}</div>
      </div>
    </div>
    ${t.description ? `<p class="card-desc">${esc(t.description)}</p>` : ''}
    ${M.progressHtml(t)}
    ${dates ? `<div class="card-meta"><span>${esc(dates)}</span></div>` : ''}
    ${plan || act ? `<div class="card-costs">${plan ? `<span><em>Planned</em> ${esc(plan)}</span>` : ''}${act ? `<span><em>Actual</em> ${esc(act)}</span>` : ''}</div>` : ''}
    <div class="card-foot">
      ${created ? `<span class="admin-meta">Created : ${esc(created)}</span>` : '<span></span>'}
      <span class="card-actions">
        ${dev ? `<a class="mini" href="${esc(dev)}" target="_blank" rel="noopener" title="Open development link">↗ Dev link</a>` : ''}
        <button type="button" class="mini${t.share_token ? ' shared' : ''}" data-act="share" title="Share">${t.share_token ? '● Shared' : 'Share'}</button>
      </span>
    </div>
  </article>`;
}

function renderBoard() {
  const main = $('#main');
  if (!state.items.length) { main.innerHTML = emptyState(); return; }
  const b = BOARDS[state.board] || BOARDS.pipeline;
  const items = visible().filter((t) => b.include(t) && matches(t));
  main.innerHTML = `<p class="board-hint">${esc(b.hint)}${dashActive() ? ' <b class="filtered-note">· Filtered</b>' : ''}</p>
  <div class="board" style="--cols:${b.columns.length}">
    ${b.columns.map((col) => {
      const cards = items.filter((t) => b.key(t) === col.id);
      return `<section class="col${state.focus === col.id ? ' focus' : ''}">
        <header class="col-head"><h2>${esc(col.label)}</h2><span class="count">${cards.length}</span></header>
        <div class="col-body" data-drop="${esc(col.id)}">
          ${cards.map((t) => cardHtml(t, state.board)).join('') || '<div class="col-empty">Drop here</div>'}
        </div>
      </section>`;
    }).join('')}
  </div>`;
}

/* ───────────── List view: sort + filter every column ─────────────
   type: text  → "contains"
         pick  → dropdown of the values present
         num   → contains, or  >100  <=50  =8
         date  → contains (e.g. "Nov 2026"), or  >1 Nov 2026  <=2026-12-31          */
const idx = (list) => (id) => { const i = list.findIndex((x) => x.id === id); return i < 0 ? null : i; };
const LIST_COLS = [
  { key: 'title', label: 'Title', type: 'text', val: (t) => t.title || '',
    cell: (t) => `<div class="t-title">${M.iconHtml(t, 'sm')}<span>${esc(t.title)}</span></div>` },
  { key: 'category', label: 'Category', type: 'pick', val: (t) => M.label(M.CATEGORIES, t.category) },
  { key: 'stage', label: 'Stage', type: 'pick', val: (t) => M.label(M.STAGES, t.stage), order: (t) => idx(M.STAGES)(t.stage) },
  { key: 'decision', label: 'Decision', type: 'pick',
    val: (t) => (t.stage === 'decision' ? (t.decision ? M.label(M.DECISIONS, t.decision) : 'Awaiting decision') : ''),
    cell: (t) => (t.stage === 'decision' ? `<span class="chip d-${t.decision || 'none'}">${esc(t.decision ? M.label(M.DECISIONS, t.decision) : 'Awaiting decision')}</span>` : '') },
  { key: 'status', label: 'Status', type: 'pick', val: (t) => (M.isProject(t) ? M.label(M.STATUSES, t.status) : ''),
    order: (t) => (M.isProject(t) ? idx(M.STATUSES)(t.status) : null),
    cell: (t) => (M.isProject(t) && t.status ? `<span class="chip s-${t.status}">${esc(M.label(M.STATUSES, t.status))}</span>` : '') },
  { key: 'priority', label: 'Priority', type: 'pick', val: (t) => (M.isProject(t) ? M.label(M.PRIORITIES, t.priority) : ''),
    order: (t) => (M.isProject(t) ? idx(M.PRIORITIES)(t.priority) : null),
    cell: (t) => (M.isProject(t) && t.priority ? `<span class="chip p-${t.priority}">${esc(M.label(M.PRIORITIES, t.priority))}</span>` : '') },
  { key: 'pct', label: '%', type: 'num', num: true,
    val: (t) => (M.isProject(t) && t.percent_complete != null && ['wip', 'on_hold', 'completed'].includes(t.status) ? +t.percent_complete : null),
    show: (v) => (v == null ? '' : v + '%') },
  { key: 'start', label: 'Start', type: 'date', val: (t) => (t.start_date ? String(t.start_date).slice(0, 10) : null), show: (v) => M.fmtDate(v) },
  { key: 'weeks', label: 'Weeks', type: 'num', num: true, val: (t) => (t.duration_weeks == null || t.duration_weeks === '' ? null : +t.duration_weeks) },
  { key: 'end', label: 'End', type: 'date', val: (t) => (t.end_date ? String(t.end_date).slice(0, 10) : null), show: (v) => M.fmtDate(v) },
  { key: 'planned', label: 'Planned cost', type: 'num', num: true, val: (t) => (t.planned_cost == null ? null : +t.planned_cost), show: (v) => M.fmtMoney(v),
    cell: (t) => moneyCell(t.planned_cost) },
  { key: 'actual', label: 'Actual cost', type: 'num', num: true, val: (t) => (t.actual_cost == null ? null : +t.actual_cost), show: (v) => M.fmtMoney(v),
    cell: (t) => moneyCell(t.actual_cost) },
  { key: 'dev', label: 'Dev link', type: 'pick', val: (t) => (M.safeUrl(t.dev_link) ? 'Has link' : ''),
    cell: (t) => { const d = M.safeUrl(t.dev_link); return d ? `<a class="mini" href="${esc(d)}" target="_blank" rel="noopener">↗ Open</a>` : ''; } },
  { key: 'created', label: 'Created', type: 'date', val: (t) => (t.created_at ? isoDay(new Date(t.created_at)) : null),
    show: (v) => (v ? M.fmtAdminDate(v + 'T00:00:00') : ''), cls: 'admin-meta' },
];
function moneyCell(n) {
  if (n == null || n === '') return '';
  const sec = M.fmtSecondary(n);
  return `<span class="money">${esc(M.fmtPrimary(n))}${sec ? `<small>${esc(sec)}</small>` : ''}</span>`;
}
const colByKey = Object.fromEntries(LIST_COLS.map((c) => [c.key, c]));
const shown = (c, t) => { const v = c.val(t); return c.show ? c.show(v) : (v == null ? '' : String(v)); };

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDateInput(s) {
  s = s.trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\s\-\/\.]+([a-z]{3})[a-z]*[\s\-\/\.,]+(\d{4})$/);
  if (m && MONTHS[m[2]]) return `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4})$/); // dd-mm-yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
const OPS = { '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '=': (a, b) => a === b };

function passesCol(c, t, f) {
  if (!f) return true;
  const text = shown(c, t);
  if (c.type === 'pick') return f === '(blank)' ? !text : text === f;
  const m = f.match(/^\s*(>=|<=|>|<|=)\s*(.+)$/);
  if (m && c.type === 'num') {
    const n = parseFloat(m[2].replace(/[£₹,\s%]/g, '')); const v = c.val(t);
    return !isNaN(n) && v != null && OPS[m[1]](v, n);
  }
  if (m && c.type === 'date') {
    const d = parseDateInput(m[2]); const v = c.val(t);
    return !!d && v != null && OPS[m[1]](v, d);
  }
  return text.toLowerCase().includes(f.trim().toLowerCase());
}

function listRows() {
  let items = visible().filter(matches);
  if (state.filter === 'thoughts') items = items.filter((t) => !M.isProject(t));
  if (state.filter === 'projects') items = items.filter(M.isProject);
  for (const [k, f] of Object.entries(state.colf)) {
    const c = colByKey[k]; if (c && f) items = items.filter((t) => passesCol(c, t, f));
  }
  const { key, dir } = state.sort; const c = colByKey[key];
  if (c && dir) {
    const sv = (t) => { if (c.order) return c.order(t); const v = c.val(t); return v === '' ? null : v; };
    items = items.map((t, i) => ({ t, i, v: sv(t) })).sort((a, b) => {
      if (a.v == null && b.v == null) return a.i - b.i;
      if (a.v == null) return 1; if (b.v == null) return -1;   // blanks always last
      const r = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), undefined, { sensitivity: 'base', numeric: true });
      return (r || a.i - b.i) * (r ? dir : 1);
    }).map((x) => x.t);
  }
  return items;
}

function rowHtml(t) {
  return `<tr data-id="${esc(t.id)}" tabindex="0">
    ${LIST_COLS.map((c) => `<td class="${c.num ? 'num' : ''}${c.type === 'date' || c.num ? ' nowrap' : ''} c-${c.key}">${c.cell ? c.cell(t) : `<span class="${c.cls || ''}">${esc(shown(c, t))}</span>`}</td>`).join('')}
    <td><button type="button" class="mini${t.share_token ? ' shared' : ''}" data-act="share">${t.share_token ? '● Shared' : 'Share'}</button></td>
  </tr>`;
}

function renderListBody() {
  const rows = listRows();
  const tb = $('#listBody'); if (!tb) return;
  tb.innerHTML = rows.map(rowHtml).join('') || `<tr class="none"><td colspan="${LIST_COLS.length + 1}">Nothing matches these filters.</td></tr>`;
  const base = visible().length;
  const anyCol = Object.values(state.colf).some(Boolean);
  $('#listInfo').innerHTML = `<span>Showing <b>${rows.length}</b> of ${base}${dashActive() ? ' (dashboard filters on)' : ''}</span>`
    + (anyCol || state.sort.dir ? ` <button type="button" class="mini clear" data-list="reset">✕ Clear column filters & sort</button>` : '');
}

function renderList() {
  const main = $('#main');
  if (!state.items.length) { main.innerHTML = emptyState(); return; }
  const pool = visible().filter(matches);
  const head = LIST_COLS.map((c) => {
    const on = state.sort.key === c.key && state.sort.dir;
    const arrow = on ? (state.sort.dir > 0 ? '▲' : '▼') : '↕';
    return `<th class="${c.num ? 'num' : ''}${on ? ' sorted' : ''}"><button type="button" class="th-sort" data-sort="${c.key}" title="Sort by ${esc(c.label)}">${esc(c.label)} <span class="arrow">${arrow}</span></button></th>`;
  }).join('');
  const filt = LIST_COLS.map((c) => {
    const v = state.colf[c.key] || '';
    if (c.type === 'pick') {
      const vals = [...new Set(pool.map((t) => shown(c, t)))];
      const opts = vals.filter(Boolean).sort((a, b) => {
        if (!c.order) return a.localeCompare(b);
        const ta = pool.find((t) => shown(c, t) === a); const tb = pool.find((t) => shown(c, t) === b);
        return (c.order(ta) ?? 99) - (c.order(tb) ?? 99);
      });
      if (vals.includes('')) opts.push('(blank)');
      return `<th><select class="col-filter${v ? ' active' : ''}" data-colf="${c.key}"><option value="">All</option>${opts.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></th>`;
    }
    const ph = c.type === 'num' ? 'e.g. >100' : c.type === 'date' ? 'e.g. Nov 2026' : 'Contains…';
    return `<th><input class="col-filter${v ? ' active' : ''}" data-colf="${c.key}" value="${esc(v)}" placeholder="${ph}" aria-label="Filter ${esc(c.label)}"></th>`;
  }).join('');
  main.innerHTML = `<p class="list-info" id="listInfo"></p>
  <div class="table-wrap"><table class="list">
    <thead><tr>${head}<th></th></tr><tr class="filter-row">${filt}<th></th></tr></thead>
    <tbody id="listBody"></tbody>
  </table></div>`;
  renderListBody();
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
  for (const n of ['title', 'icon', 'category', 'stage', 'decision', 'priority', 'status', 'percent_complete', 'start_date',
    'duration_weeks', 'description', 'planned_cost', 'actual_cost', 'dev_link']) {
    fe(n).value = t[n] ?? '';
  }
  if (!fe('stage').value) fe('stage').value = 'initial';
  $('#drawerTitle').textContent = id ? t.title || 'Edit' : 'New thought';
  const created = id ? M.fmtAdminDate(t.created_at) : '';
  $('#createdOn').textContent = created ? `Created : ${created}` : '';
  $('#createdOn').hidden = !created;
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
  $('#decisionRow').hidden = !isDecision;
  fe('category').classList.toggle('empty', !fe('category').value);
  const proj = isDecision && fe('decision').value === 'proceed';
  fe('priority').disabled = !proj;
  fe('status').disabled = !proj;
  if (proj) {
    if (!fe('priority').value) fe('priority').value = 'medium';
    if (!fe('status').value) fe('status').value = 'not_started';
  }
  const status = fe('status').value;
  const showPct = proj && status === 'wip';
  if (showPct && fe('percent_complete').value === '') fe('percent_complete').value = 0;
  $('#pctField').hidden = !showPct;
  $('#projGrid').className = showPct ? 'grid-3' : 'grid-2';
  const pv = Math.max(0, Math.min(100, +fe('percent_complete').value || 0));
  $('#pctBar span').style.width = pv + '%';
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
  const sec2 = M.fmtSecondary(fe('actual_cost').value);
  $('#actualSecondary').textContent = sec2 ? `≈ ${sec2}` : '';
}

function readForm() {
  const v = (n) => fe(n).value.trim();
  const num = (n) => (v(n) === '' ? null : Number(v(n)));
  const stage = v('stage') || 'initial';
  const d = {
    title: v('title'),
    icon: v('icon'),
    category: v('category') || null,
    stage,
    decision: stage === 'decision' ? v('decision') || null : null,
    priority: v('priority') || null,
    status: v('status') || null,
    percent_complete: null,
    start_date: v('start_date') || null,
    duration_weeks: num('duration_weeks'),
    description: v('description'),
    planned_cost: num('planned_cost'),
    actual_cost: num('actual_cost'),
    dev_link: M.normaliseUrl(v('dev_link')),
  };
  d.end_date = M.endDate(d.start_date, d.duration_weeks);
  d.percent_complete = M.percentFor(M.isProject(d) ? d.status : null, num('percent_complete'));
  return d;
}

function validate(d) {
  if (!d.title) return 'Please give it a title.';
  if (!d.category) return 'Please choose a Category.';
  if (M.wordCount(d.description) > M.WORD_LIMIT) return `Description is over ${M.WORD_LIMIT} words.`;
  if (d.dev_link && !M.safeUrl(d.dev_link)) return 'Development link must be a web address.';
  const rawPct = fe('percent_complete').value.trim();
  if (M.isProject(d) && d.status === 'wip' && rawPct !== '' && (+rawPct < 0 || +rawPct > 100 || isNaN(+rawPct))) return '% Complete must be between 0 and 100.';
  if (d.duration_weeks !== null && (d.duration_weeks < 0 || !Number.isFinite(d.duration_weeks))) return 'Duration must be 0 or more weeks.';
  if (d.planned_cost !== null && (d.planned_cost < 0 || !Number.isFinite(d.planned_cost))) return 'Planned cost must be 0 or more.';
  if (d.actual_cost !== null && (d.actual_cost < 0 || !Number.isFinite(d.actual_cost))) return 'Actual cost must be 0 or more.';
  return null;
}

async function onSave(e) {
  e.preventDefault();
  const d = readForm();
  const err = validate(d);
  if (err) {
    if (!d.category && d.title) { fe('category').focus(); fe('category').classList.add('invalid'); }
    return toast(err, true);
  }
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

  // Category options in the editor (A→Z)
  fe('category').innerHTML = '<option value="">Choose a category…</option>'
    + M.CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
  fe('category').addEventListener('change', () => fe('category').classList.remove('invalid'));

  // Dashboard filters
  const setDash = (patch) => { Object.assign(state.dash, patch); state.colf = state.colf || {}; savePrefs(); render(); };
  $('#fCat').addEventListener('change', (e) => setDash({ cat: e.target.value }));
  $('#fStart').addEventListener('change', (e) => setDash({ start: e.target.value }));
  $('#fFrom').addEventListener('change', (e) => setDash({ from: e.target.value }));
  $('#fTo').addEventListener('change', (e) => setDash({ to: e.target.value }));
  $('#fClear').addEventListener('click', () => setDash({ cat: '', start: '', from: '', to: '' }));

  // List: sorting + column filters
  $('#main').addEventListener('click', (e) => {
    const sb = e.target.closest('[data-sort]');
    if (sb) {
      e.stopPropagation();
      const k = sb.dataset.sort; const s0 = state.sort;
      state.sort = s0.key !== k ? { key: k, dir: 1 } : s0.dir === 1 ? { key: k, dir: -1 } : { key: '', dir: 0 };
      savePrefs(); renderList(); return;
    }
    if (e.target.closest('[data-list="reset"]')) { e.stopPropagation(); state.colf = {}; state.sort = { key: '', dir: 0 }; savePrefs(); renderList(); return; }
    if (e.target.closest('.filter-row')) e.stopPropagation();
  }, true);
  $('#main').addEventListener('input', (e) => {
    const f = e.target.closest('input[data-colf]'); if (!f) return;
    state.colf[f.dataset.colf] = f.value; f.classList.toggle('active', !!f.value); renderListBody();
  });
  $('#main').addEventListener('change', (e) => {
    const f = e.target.closest('select[data-colf]'); if (!f) return;
    state.colf[f.dataset.colf] = f.value; f.classList.toggle('active', !!f.value); renderListBody();
  });

  // Summary tiles
  $('#summary').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) goTo(b.dataset.go); });

  // Toolbar
  $('#viewSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) { state.focus = null; state.view = b.dataset.view; savePrefs(); render(); } });
  $('#boardSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-board]'); if (b) { state.focus = null; state.board = b.dataset.board; savePrefs(); render(); } });
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
  $$('.currency-note').forEach((el) => (el.textContent = `in ${M.currencySymbol()}`));
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
