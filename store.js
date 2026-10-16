// Data layer. Two interchangeable stores:
//   LocalStore    – browser localStorage (no setup, single device, no sharing)
//   SupabaseStore – free online Postgres with login + per-item share links
import { CONFIG } from './config.js';
import { FIELDS, blank, endDate } from './model.js';

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

export async function createStore() {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    return new SupabaseStore(createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY));
  }
  return new LocalStore();
}
