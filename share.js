// Public, read-only view of ONE shared Thought / Project.
// It can only fetch the row whose secret share token is in the URL.
import { CONFIG } from './config.js';
import { createStore } from './store.js';
import * as M from './model.js';

const root = document.getElementById('share');
const { esc } = M;

const msg = (title, text) => {
  root.innerHTML = `<div class="share-msg"><div class="empty-sq" aria-hidden="true"></div><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p></div>`;
};

(async () => {
  const token = new URLSearchParams(location.search).get('t');
  if (!token) return msg('Link incomplete', 'This share link is missing its code.');
  try {
    const store = await createStore();
    if (store.mode !== 'supabase') return msg('Not available', 'This board is not connected to an online database yet.');
    const t = await store.getShared(token);
    if (!t) return msg('Link no longer active', 'The owner may have stopped sharing this item.');
    render(t);
  } catch (e) {
    console.error(e);
    msg('Could not load', 'Please try again in a moment. If the database was idle for a week, it may be waking up.');
  }
})();

function fact(k, v) { return v ? `<div class="fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : ''; }
function section(h, text) {
  return text ? `<section class="share-sec"><h2>${esc(h)}</h2><p>${esc(text)}</p></section>` : '';
}

function render(t) {
  document.title = `${t.title} · ${CONFIG.APP_NAME}`;
  const proj = M.isProject(t);
  const dev = M.safeUrl(t.dev_link);
  root.innerHTML = `
    <article class="share-card">
      <header class="share-head">
        ${M.iconHtml(t, 'xl')}
        <div>
          <p class="eyebrow">${proj ? 'Project' : 'Thought'}</p>
          <h1>${esc(t.title)}</h1>
          <div class="chips">${M.chipsHtml(t)}</div>
        </div>
      </header>
      <div class="facts">
        ${fact('Stage', M.label(M.STAGES, t.stage))}
        ${t.stage === 'decision' ? fact('Decision', t.decision ? M.label(M.DECISIONS, t.decision) : 'Awaiting decision') : ''}
        ${proj ? fact('Priority', M.label(M.PRIORITIES, t.priority)) : ''}
        ${proj ? fact('Status', M.label(M.STATUSES, t.status)) : ''}
        ${fact('Start date', M.fmtDate(t.start_date))}
        ${fact('Duration', t.duration_weeks != null ? `${t.duration_weeks} weeks` : '')}
        ${fact('End date', M.fmtDate(t.end_date))}
        ${fact('Planned cost', M.fmtMoney(t.planned_cost))}
      </div>
      ${section('Description', t.description)}
      ${section('Objective', t.objective)}
      ${section('Expected benefit', t.expected_benefit)}
      ${dev ? `<a class="btn primary" href="${esc(dev)}" target="_blank" rel="noopener">↗ Open development link</a>` : ''}
      <footer class="share-foot">Shared read-only from ${esc(CONFIG.APP_NAME)}${t.updated_at ? ` · updated ${esc(M.fmtDate(t.updated_at))}` : ''}</footer>
    </article>`;
}
