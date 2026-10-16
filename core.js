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
    'title', 'icon', 'stage', 'decision', 'priority', 'status',
    'start_date', 'duration_weeks', 'end_date',
    'description', 'objective', 'expected_benefit', 'planned_cost',
    'dev_link', 'share_token', 'sort_order',
  ];
  
  function blank() {
    return {
      id: null, title: '', icon: '', stage: 'initial', decision: null,
      priority: null, status: null, start_date: null, duration_weeks: null,
      end_date: null, description: '', objective: '', expected_benefit: '',
      planned_cost: null, dev_link: '', share_token: null, sort_order: 0,
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
  
  function fmtMoney(n) {
    if (n === null || n === undefined || n === '' || isNaN(+n)) return '';
    try {
      return new Intl.NumberFormat(CONFIG.LOCALE, {
        style: 'currency', currency: CONFIG.CURRENCY, maximumFractionDigits: 0,
      }).format(+n);
    } catch { return String(n); }
  }
  
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
  
  const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
  
  function chipsHtml(t, { hideStage = false } = {}) {
    const c = [];
    if (isProject(t)) {
      c.push(chip('Project', 'accent'));
      if (t.status) c.push(chip(label(STATUSES, t.status), 's-' + t.status));
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
  
  return { STAGES, DECISIONS, PRIORITIES, STATUSES, WORD_LIMIT, FIELDS, blank, isProject, decisionPatch, endDate, label, wordCount, fmtDate, fmtMoney, esc, safeUrl, normaliseUrl, iconHtml, chipsHtml, dateLine };
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
      if (v === '' && ['decision', 'priority', 'status', 'start_date', 'end_date', 'duration_weeks', 'planned_cost', 'share_token'].includes(k)) v = null;
      if ((k === 'duration_weeks' || k === 'planned_cost') && v !== null && v !== undefined) v = Number(v);
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
        mk({ title: 'Write a family recipe book', icon: '📖', stage: 'data_gathering',
          description: 'Collect recipes from relatives and turn them into a small printed book.',
          objective: 'Preserve family recipes for the next generation.' }),
        mk({ title: 'Learn watercolour painting', icon: '🎨', stage: 'review',
          description: 'Weekend classes or an online course.', planned_cost: 8000 }),
        mk({ title: 'Home vegetable garden', icon: '🌱', stage: 'decision', decision: 'proceed',
          priority: 'high', status: 'wip', start_date: today, duration_weeks: 8,
          description: 'Raised beds on the terrace with drip irrigation.',
          objective: 'Grow a share of our own greens year round.',
          expected_benefit: 'Fresh produce, lower grocery bill, weekend activity.',
          planned_cost: 25000 }),
        mk({ title: 'Sabbatical travel year', stage: 'decision', decision: 'future',
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
  
    static ok({ data, error }) { if (error) throw new Error(error.message); return data; }
  
    async session() { const { data } = await this.sb.auth.getSession(); return data.session; }
    async signIn(email, password) {
      const { error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    }
    async signOut() { await this.sb.auth.signOut(); }
  
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
