/* Thought Board core: model + data layer. Loaded after config.js. */

/* Shared definitions & helpers */
var M = (function () {
  // Shared definitions & helpers (used by the dashboard and the share page)
  
  const STAGES = [
    { id: 'initial',        label: 'Initial' },
    { id: 'data_gathering', label: 'Data Gathering' },
    { id: 'review',         label: 'Review' },
    { id: 'decision',       label: 'Decision' },
  ];
  
  const DECISIONS = [
    { id: 'proceed', label: 'Proceed' },
    { id: 'dropped', label: 'Dropped' },
    { id: 'future',  label: 'For Future Consideration' },
    { id: 'on_hold', label: 'On-Hold' },
  ];
  
  // Categories — shown in ascending (A→Z) order
  // App name. An older config.js still saying 'Thought Board' gets the new name.
  const APP_NAME = !CONFIG.APP_NAME || CONFIG.APP_NAME === 'Thought Board' ? 'My Thought Board' : CONFIG.APP_NAME;

  const CATEGORIES = [
    { id: 'client_work',       label: 'Client Work' },
    { id: 'family_wellbeing',  label: 'Family & Wellbeing' },
    { id: 'finance',           label: 'Finance' },
    { id: 'home_improvements', label: 'Home Improvements' },
    { id: 'personal',          label: 'Personal' },
    { id: 'revenue',           label: 'Revenue' },
  ].sort((a, b) => a.label.localeCompare(b.label));

  const PRIORITIES = [
    { id: 'high',   label: 'High' },
    { id: 'medium', label: 'Medium' },
    { id: 'low',    label: 'Low' },
  ];
  
  const STATUSES = [
    { id: 'not_started', label: 'Not Started' },
    { id: 'wip',         label: 'WIP' },
    { id: 'on_hold',     label: 'On-Hold' },
    { id: 'completed',   label: 'Completed' },
  ];
  
  const WORD_LIMIT = CONFIG.WORD_LIMIT || 250;
  
  // Columns that are saved to the database
  const FIELDS = [
    'title', 'icon', 'category', 'stage', 'decision', 'priority', 'status',
    'percent_complete', 'start_date', 'duration_weeks', 'end_date',
    'description', 'planned_cost', 'actual_cost',
    'dev_link', 'share_token', 'sort_order',
  ];
  
  function blank() {
    return {
      id: null, title: '', icon: '', category: '', stage: 'initial', decision: null,
      priority: null, status: null, percent_complete: null, start_date: null, duration_weeks: null,
      end_date: null, description: '',
      planned_cost: null, actual_cost: null, dev_link: '', share_token: null, sort_order: 0,
    };
  }
  
  /** A Thought becomes a Project once its Decision is "Proceed". */
  const isProject = (t) => !!t && t.stage === 'decision' && t.decision === 'proceed';
  
  /** Patch for setting a decision; promoting to Project fills sensible defaults. */
  function decisionPatch(t, decision) {
    const p = { stage: 'decision', decision: decision || null };
    if (decision === 'proceed') {
      p.priority = t.priority || 'medium';
      p.status = t.status || 'not_started';
    }
    return p;
  }
  
  /** End date = start date + duration (weeks). Returns 'YYYY-MM-DD' or null. */
  function endDate(start, weeks) {
    if (!start || weeks === null || weeks === undefined || weeks === '' || isNaN(+weeks)) return null;
    const [y, m, d] = String(start).split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + Math.round(+weeks * 7));
    return dt.toISOString().slice(0, 10);
  }
  
  const label = (list, id) => (list.find((x) => x.id === id) || {}).label || '';
  
  function wordCount(s) {
    return (s || '').trim().split(/\s+/).filter(Boolean).length;
  }
  
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d)) return '';
    return d.toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  
  /** Admin date: "16-Oct-2026" (local time). */
  function fmtAdminDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const m = d.toLocaleString('en-GB', { month: 'short' });
    return `${String(d.getDate()).padStart(2, '0')}-${m}-${d.getFullYear()}`;
  }

  /* ── Currency: GBP primary, INR secondary at the latest daily rate ── */
  const CUR1 = CONFIG.PRIMARY_CURRENCY || 'GBP';
  const CUR2 = CONFIG.SECONDARY_CURRENCY || 'INR';
  const LOC1 = CONFIG.PRIMARY_LOCALE || 'en-GB';
  const LOC2 = CONFIG.SECONDARY_LOCALE || 'en-IN';
  const FX_KEY = 'thoughtboard.fx.v1';
  const FX_MAX_AGE = 6 * 60 * 60 * 1000; // re-check every 6 hours
  const XE_URL = `https://www.xe.com/currencyconverter/convert/?Amount=1&From=${CUR1}&To=${CUR2}`;

  // fx = { rate, date, source, manual, fetched_at }
  const fx = { rate: null, date: null, source: null, manual: false, fetched_at: 0 };
  try { Object.assign(fx, JSON.parse(localStorage.getItem(FX_KEY) || '{}')); } catch { /* ignore */ }
  const fxSave = () => { try { localStorage.setItem(FX_KEY, JSON.stringify(fx)); } catch { /* ignore */ } };

  async function getJson(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  // Free, no-key sources, tried in order. Each returns { rate, date }.
  const FX_SOURCES = [
    { name: 'Frankfurter (ECB)', url: `https://api.frankfurter.dev/v2/rate/${CUR1}/${CUR2}`,
      read: (d) => ({ rate: d.rate ?? (d.rates && d.rates[CUR2]), date: d.date }) },
    { name: 'Frankfurter (ECB)', url: `https://api.frankfurter.dev/v1/latest?base=${CUR1}&symbols=${CUR2}`,
      read: (d) => ({ rate: d.rates && d.rates[CUR2], date: d.date }) },
    { name: 'ExchangeRate-API', url: `https://open.er-api.com/v6/latest/${CUR1}`,
      read: (d) => ({ rate: d.rates && d.rates[CUR2],
        date: d.time_last_update_unix ? new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10) : null }) },
  ];

  /** Fetch the latest rate (unless a manual rate is set). Resolves true if the rate changed. */
  async function fxRefresh(force = false) {
    if (fx.manual) return false;
    if (!force && fx.rate && Date.now() - fx.fetched_at < FX_MAX_AGE) return false;
    for (const s of FX_SOURCES) {
      try {
        const { rate, date } = s.read(await getJson(s.url));
        if (rate && isFinite(rate) && rate > 0) {
          const changed = rate !== fx.rate;
          Object.assign(fx, { rate: +rate, date: date || new Date().toISOString().slice(0, 10),
            source: s.name, manual: false, fetched_at: Date.now() });
          fxSave();
          return changed;
        }
      } catch { /* try next source */ }
    }
    return false; // keep last known rate (if any)
  }

  /** Set a manual rate (e.g. copied from XE). Pass null to return to automatic. */
  async function fxSetManual(rate) {
    if (rate && isFinite(rate) && rate > 0) {
      Object.assign(fx, { rate: +rate, date: new Date().toISOString().slice(0, 10), source: 'Your rate', manual: true, fetched_at: Date.now() });
      fxSave();
      return true;
    }
    fx.manual = false; fx.fetched_at = 0; fxSave();
    return fxRefresh(true);
  }

  function fmtCur(n, cur, loc, digits = 0) {
    try { return new Intl.NumberFormat(loc, { style: 'currency', currency: cur, maximumFractionDigits: digits }).format(+n); }
    catch { return `${cur} ${n}`; }
  }
  const hasAmount = (n) => !(n === null || n === undefined || n === '' || isNaN(+n));
  const fmtPrimary = (n) => (hasAmount(n) ? fmtCur(n, CUR1, LOC1) : '');
  const fmtSecondary = (n) => (hasAmount(n) && fx.rate ? fmtCur(+n * fx.rate, CUR2, LOC2) : '');
  /** "£1,200 (₹1,34,500)" — secondary omitted if no rate is known yet. */
  function fmtMoney(n) {
    if (!hasAmount(n)) return '';
    const s = fmtSecondary(n);
    return s ? `${fmtPrimary(n)} (${s})` : fmtPrimary(n);
  }
  /** "£1 = ₹112.45 · Frankfurter (ECB), 16 Oct 2026" */
  function fxLabel() {
    if (!fx.rate) return `${CUR2} rate unavailable`;
    return `${fmtCur(1, CUR1, LOC1)} = ${fmtCur(fx.rate, CUR2, LOC2, 2)} · ${fx.source || ''}${fx.date ? ', ' + fmtDate(fx.date) : ''}`;
  }
  const currencySymbol = () => (fmtCur(0, CUR1, LOC1).replace(/[\d.,\s]/g, '') || CUR1);
  
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  
  /** Only allow http(s) links to be rendered. */
  function safeUrl(u) {
    try {
      const x = new URL(String(u || '').trim());
      return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
    } catch { return null; }
  }
  
  function normaliseUrl(u) {
    const v = String(u || '').trim();
    if (!v) return '';
    return /^[a-z]+:\/\//i.test(v) ? v : 'https://' + v;
  }
  
  function initials(title) {
    const w = String(title || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '·';
    return (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase();
  }
  
  /** The square icon: an image URL, an emoji/short text, or the title's initials. */
  function iconHtml(t, size = '') {
    const v = String(t.icon || '').trim();
    const cls = `icon-sq ${size}`.trim();
    const url = v && safeUrl(v);
    if (url) return `<span class="${cls}"><img src="${esc(url)}" alt="" loading="lazy"></span>`;
    if (v) return `<span class="${cls} glyph">${esc([...v].slice(0, 2).join(''))}</span>`;
    return `<span class="${cls}">${esc(initials(t.title))}</span>`;
  }
  
  /** % Complete rules: WIP keeps its value (default 0), Completed = 100,
      On-Hold keeps the last value, Not Started clears it. */
  function percentFor(status, pct) {
    const p = pct === null || pct === undefined || pct === '' || isNaN(+pct) ? null : Math.max(0, Math.min(100, Math.round(+pct)));
    if (status === 'completed') return 100;
    if (status === 'wip') return p ?? 0;
    if (status === 'on_hold') return p;
    return null;
  }
  /** Progress bar for WIP / On-Hold projects with a % value. */
  function progressHtml(t, size = '') {
    if (!isProject(t) || t.percent_complete == null || !['wip', 'on_hold'].includes(t.status)) return '';
    const p = Math.max(0, Math.min(100, +t.percent_complete));
    return `<div class="progress ${size}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" title="${p}% complete"><span style="width:${p}%"></span></div>`;
  }

  const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
  
  function chipsHtml(t, { hideStage = false } = {}) {
    const c = [];
    if (isProject(t)) {
      c.push(chip('Project', 'accent'));
      if (t.status) c.push(chip(label(STATUSES, t.status) + (t.percent_complete != null && ['wip', 'on_hold'].includes(t.status) ? ` · ${t.percent_complete}%` : ''), 's-' + t.status));
      if (t.priority) c.push(chip(label(PRIORITIES, t.priority), 'p-' + t.priority));
    } else {
      if (!hideStage) c.push(chip(label(STAGES, t.stage)));
      if (t.stage === 'decision') {
        c.push(chip(t.decision ? label(DECISIONS, t.decision) : 'Awaiting decision', 'd-' + (t.decision || 'none')));
      }
    }
    return c.join('');
  }
  
  function dateLine(t) {
    const parts = [];
    if (t.start_date) parts.push(fmtDate(t.start_date));
    if (t.end_date) parts.push(fmtDate(t.end_date));
    let s = parts.join(' → ');
    if (t.duration_weeks !== null && t.duration_weeks !== undefined && t.duration_weeks !== '') {
      s += (s ? ' · ' : '') + `${t.duration_weeks} wk${+t.duration_weeks === 1 ? '' : 's'}`;
    }
    return s;
  }
  
  return { APP_NAME, CATEGORIES, STAGES, DECISIONS, PRIORITIES, STATUSES, WORD_LIMIT, FIELDS, blank, isProject, decisionPatch, endDate, label, wordCount, fmtDate, fmtAdminDate, percentFor, progressHtml, fmtMoney, fmtPrimary, fmtSecondary, fx, fxRefresh, fxSetManual, fxLabel, currencySymbol, XE_URL, CUR1, CUR2, esc, safeUrl, normaliseUrl, iconHtml, chipsHtml, dateLine };
})();

/* Data layer */
var createStore = (function () {
  // Data layer. Two interchangeable stores:
  //   LocalStore    – browser localStorage (no setup, single device, no sharing)
  //   SupabaseStore – free online Postgres with login + per-item share links
  
  const { FIELDS, blank, endDate } = M;
  const LS_KEY = 'thoughtboard.items.v1';
  
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }));
  
  /** Keep only known columns and normalise empty values to null. */
  function clean(d) {
    const out = {};
    for (const k of FIELDS) {
      if (!(k in d)) continue;
      let v = d[k];
      if (v === '' && ['category', 'decision', 'priority', 'status', 'percent_complete', 'start_date', 'end_date', 'duration_weeks', 'planned_cost', 'actual_cost', 'share_token'].includes(k)) v = null;
      if ((k === 'duration_weeks' || k === 'planned_cost' || k === 'actual_cost' || k === 'percent_complete') && v !== null && v !== undefined) v = Number(v);
      out[k] = v;
    }
    if ('start_date' in out || 'duration_weeks' in out) {
      if (!('end_date' in out)) out.end_date = endDate(out.start_date, out.duration_weeks);
    }
    return out;
  }
  
  /* ───────────── Local (browser) ───────────── */
  class LocalStore {
    mode = 'local';
    _mem = null;
  
    read() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw === null) return (this._mem ??= this.seed());
        return JSON.parse(raw);
      } catch { return (this._mem ??= this.seed()); }
    }
    write(a) {
      this._mem = a;
      try { localStorage.setItem(LS_KEY, JSON.stringify(a)); } catch { /* storage unavailable */ }
    }
    seed() {
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const mk = (o) => ({ ...blank(), ...o, id: uid(), created_at: now, updated_at: now,
        end_date: endDate(o.start_date, o.duration_weeks) });
      const rows = [
        mk({ title: 'Write a family recipe book', icon: '📖', category: 'family_wellbeing', stage: 'data_gathering',
          description: 'Collect recipes from relatives and turn them into a small printed book.', }),
        mk({ title: 'Learn watercolour painting', icon: '🎨', category: 'personal', stage: 'review',
          description: 'Weekend classes or an online course.', planned_cost: 80 }),
        mk({ title: 'Home vegetable garden', icon: '🌱', category: 'home_improvements', stage: 'decision', decision: 'proceed',
          priority: 'high', status: 'wip', percent_complete: 40, start_date: today, duration_weeks: 8,
          description: 'Raised beds on the terrace with drip irrigation.',
          planned_cost: 250, actual_cost: 95 }),
        mk({ title: 'Sabbatical travel year', category: 'finance', stage: 'decision', decision: 'future',
          description: 'Take a long break to travel.' }),
      ];
      this.write(rows);
      return rows;
    }
  
    async session() { return { user: { email: 'local' } }; }
    async list() { return [...this.read()].sort((a, b) => String(b.updated_at).localeCompare(a.updated_at)); }
    async create(d) {
      const now = new Date().toISOString();
      const row = { ...blank(), ...clean(d), id: uid(), created_at: now, updated_at: now };
      const a = this.read(); a.unshift(row); this.write(a);
      return row;
    }
    async update(id, patch) {
      const a = this.read(); const i = a.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('Item not found');
      a[i] = { ...a[i], ...clean(patch), updated_at: new Date().toISOString() };
      this.write(a);
      return a[i];
    }
    async remove(id) { this.write(this.read().filter((x) => x.id !== id)); }
    async setShare(id, on) { return this.update(id, { share_token: on ? uid() : null }); }
    async getShared() { throw new Error('Sharing needs the online database (see README).'); }
    async signOut() {}
  }
  
  /* ───────────── Supabase (online, free tier) ───────────── */
  class SupabaseStore {
    mode = 'supabase';
    constructor(client) { this.sb = client; }
  
    static ok({ data, error }) {
      if (error) {
        if (/category/.test(error.message)) throw new Error('Database needs a one-time update: run migration-03-category.sql in Supabase → SQL Editor.');
        if (/actual_cost/.test(error.message)) throw new Error('Database needs a one-time update: run migration-02-actual-cost.sql in Supabase → SQL Editor.');
        if (/percent_complete/.test(error.message)) throw new Error('Database needs a one-time update: run migration-01-percent-complete.sql in Supabase → SQL Editor.');
        throw new Error(error.message);
      }
      return data;
    }
  
    async session() { const { data } = await this.sb.auth.getSession(); return data.session; }
    async signIn(email, password) {
      const { error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    }
    async signOut() { await this.sb.auth.signOut(); }

    /** Check the current password, then set the new one. */
    async changePassword(current, next) {
      const { data } = await this.sb.auth.getUser();
      const email = data && data.user && data.user.email;
      if (!email) throw new Error('Please sign in again.');
      const check = await this.sb.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new Error('Current password is incorrect.');
      const { error } = await this.sb.auth.updateUser({ password: next });
      if (error) {
        if (/different from the old/i.test(error.message)) throw new Error('New password must be different from the current one.');
        throw new Error(error.message);
      }
    }
  
    async list() {
      return SupabaseStore.ok(await this.sb.from('thoughts').select('*').order('updated_at', { ascending: false }));
    }
    async create(d) {
      return SupabaseStore.ok(await this.sb.from('thoughts').insert(clean(d)).select().single());
    }
    async update(id, patch) {
      return SupabaseStore.ok(await this.sb.from('thoughts').update(clean(patch)).eq('id', id).select().single());
    }
    async remove(id) { SupabaseStore.ok(await this.sb.from('thoughts').delete().eq('id', id)); }
    async setShare(id, on) { return this.update(id, { share_token: on ? uid() : null }); }
  
    /** Public, read-only: returns only the single item matching the token. */
    async getShared(token) {
      const rows = SupabaseStore.ok(await this.sb.rpc('get_shared_thought', { p_token: token }));
      return Array.isArray(rows) ? rows[0] || null : rows;
    }
  }
  
  async function createStore() {
    if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
      if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
      return new SupabaseStore(window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY));
    }
    return new LocalStore();
  }
  
  function loadScript(src) {
    return new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.onload = res;
      el.onerror = () => rej(new Error('Could not load the database library. Check your internet connection.'));
      document.head.appendChild(el);
    });
  }
  
  return createStore;
})();
