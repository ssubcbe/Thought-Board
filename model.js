// Shared definitions & helpers (used by the dashboard and the share page)
import { CONFIG } from './config.js';

export const STAGES = [
  { id: 'initial',        label: 'Initial' },
  { id: 'data_gathering', label: 'Data Gathering' },
  { id: 'review',         label: 'Review' },
  { id: 'decision',       label: 'Decision' },
];

export const DECISIONS = [
  { id: 'proceed', label: 'Proceed' },
  { id: 'dropped', label: 'Dropped' },
  { id: 'future',  label: 'For Future Consideration' },
  { id: 'on_hold', label: 'On-Hold' },
];

export const PRIORITIES = [
  { id: 'high',   label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low',    label: 'Low' },
];

export const STATUSES = [
  { id: 'not_started', label: 'Not Started' },
  { id: 'wip',         label: 'WIP' },
  { id: 'on_hold',     label: 'On-Hold' },
  { id: 'completed',   label: 'Completed' },
];

export const WORD_LIMIT = CONFIG.WORD_LIMIT || 250;

// Columns that are saved to the database
export const FIELDS = [
  'title', 'icon', 'stage', 'decision', 'priority', 'status',
  'start_date', 'duration_weeks', 'end_date',
  'description', 'objective', 'expected_benefit', 'planned_cost',
  'dev_link', 'share_token', 'sort_order',
];

export function blank() {
  return {
    id: null, title: '', icon: '', stage: 'initial', decision: null,
    priority: null, status: null, start_date: null, duration_weeks: null,
    end_date: null, description: '', objective: '', expected_benefit: '',
    planned_cost: null, dev_link: '', share_token: null, sort_order: 0,
  };
}

/** A Thought becomes a Project once its Decision is "Proceed". */
export const isProject = (t) => !!t && t.stage === 'decision' && t.decision === 'proceed';

/** Patch for setting a decision; promoting to Project fills sensible defaults. */
export function decisionPatch(t, decision) {
  const p = { stage: 'decision', decision: decision || null };
  if (decision === 'proceed') {
    p.priority = t.priority || 'medium';
    p.status = t.status || 'not_started';
  }
  return p;
}

/** End date = start date + duration (weeks). Returns 'YYYY-MM-DD' or null. */
export function endDate(start, weeks) {
  if (!start || weeks === null || weeks === undefined || weeks === '' || isNaN(+weeks)) return null;
  const [y, m, d] = String(start).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.round(+weeks * 7));
  return dt.toISOString().slice(0, 10);
}

export const label = (list, id) => (list.find((x) => x.id === id) || {}).label || '';

export function wordCount(s) {
  return (s || '').trim().split(/\s+/).filter(Boolean).length;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return '';
  return d.toLocaleDateString(CONFIG.LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function fmtMoney(n) {
  if (n === null || n === undefined || n === '' || isNaN(+n)) return '';
  try {
    return new Intl.NumberFormat(CONFIG.LOCALE, {
      style: 'currency', currency: CONFIG.CURRENCY, maximumFractionDigits: 0,
    }).format(+n);
  } catch { return String(n); }
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Only allow http(s) links to be rendered. */
export function safeUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch { return null; }
}

export function normaliseUrl(u) {
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
export function iconHtml(t, size = '') {
  const v = String(t.icon || '').trim();
  const cls = `icon-sq ${size}`.trim();
  const url = v && safeUrl(v);
  if (url) return `<span class="${cls}"><img src="${esc(url)}" alt="" loading="lazy"></span>`;
  if (v) return `<span class="${cls} glyph">${esc([...v].slice(0, 2).join(''))}</span>`;
  return `<span class="${cls}">${esc(initials(t.title))}</span>`;
}

const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;

export function chipsHtml(t, { hideStage = false } = {}) {
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

export function dateLine(t) {
  const parts = [];
  if (t.start_date) parts.push(fmtDate(t.start_date));
  if (t.end_date) parts.push(fmtDate(t.end_date));
  let s = parts.join(' → ');
  if (t.duration_weeks !== null && t.duration_weeks !== undefined && t.duration_weeks !== '') {
    s += (s ? ' · ' : '') + `${t.duration_weeks} wk${+t.duration_weeks === 1 ? '' : 's'}`;
  }
  return s;
}
