// ── DOM helpers ──────────────────────────────────────────────────
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── Formatting ───────────────────────────────────────────────────
export function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
export function relTime(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function fmtUsd(n) {
  if (n == null) return '';
  if (n < 0.01 && n > 0) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
export function fmtTokens(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Time-bucketed usage aggregation ─────────────────────────────
// Buckets every session (from State.projects) into trailing calendar days by
// endTime, so Dashboard/Usage&Cost can show real 7-day trends without any
// backend change — sessions already carry the full historical timestamps.
export function dailyBuckets(projects, days = 7) {
  const now = new Date();
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({
      date, label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      sessionIds: new Set(), messageCount: 0, toolCalls: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cost: 0,
    });
  }
  const firstDayStart = buckets[0].date.getTime();
  const bucketIndexFor = (ts) => {
    const d = new Date(ts);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((dayStart - firstDayStart) / 86_400_000);
  };

  for (const proj of projects) {
    for (const sess of proj.sessions) {
      if (!sess.endTime) continue;
      const idx = bucketIndexFor(sess.endTime);
      if (idx < 0 || idx >= buckets.length) continue;
      const b = buckets[idx];
      b.sessionIds.add(sess.id);
      b.messageCount += (sess.userCount || 0) + (sess.assistantCount || 0);
      b.toolCalls += sess.toolCalls || 0;
      const u = sess.usage;
      if (u) {
        b.inputTokens += u.inputTokens || 0;
        b.outputTokens += u.outputTokens || 0;
        b.cacheReadTokens += u.cacheReadTokens || 0;
        b.cost += u.estCostUsd || 0;
      }
    }
  }

  return buckets.map(b => ({
    label: b.label,
    sessionCount: b.sessionIds.size,
    messageCount: b.messageCount,
    toolCalls: b.toolCalls,
    inputTokens: b.inputTokens,
    outputTokens: b.outputTokens,
    tokens: b.inputTokens + b.outputTokens,
    cost: b.cost,
    cacheHitRate: (b.cacheReadTokens + b.inputTokens) > 0 ? b.cacheReadTokens / (b.cacheReadTokens + b.inputTokens) : 0,
  }));
}

// Total estimated cost for a given calendar month (0 = current month, 1 = last month, ...).
export function monthlySpend(projects, monthsBack = 0) {
  const now = new Date();
  const targetMonthIdx = now.getMonth() - monthsBack;
  const targetYear = now.getFullYear() + Math.floor(targetMonthIdx / 12);
  const targetMonth = ((targetMonthIdx % 12) + 12) % 12;
  let total = 0;
  for (const proj of projects) {
    for (const sess of proj.sessions) {
      if (!sess.endTime || !sess.usage) continue;
      const d = new Date(sess.endTime);
      if (d.getFullYear() === targetYear && d.getMonth() === targetMonth) total += sess.usage.estCostUsd || 0;
    }
  }
  return total;
}

// ── JSON syntax coloring ────────────────────────────────────────
export function renderJson(obj) {
  const str = JSON.stringify(obj, null, 2);
  return str
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span class="json-key">${escHtml(match)}</span>`;
        return `<span class="json-str">${escHtml(match)}</span>`;
      }
      if (/true|false/.test(match)) return `<span class="json-bool">${match}</span>`;
      if (/null/.test(match)) return `<span class="json-null">${match}</span>`;
      return `<span class="json-num">${match}</span>`;
    });
}

// ── marked / highlight.js setup ─────────────────────────────────
// eslint-disable-next-line no-undef
marked.setOptions({
  highlight: (code, lang) => {
    // eslint-disable-next-line no-undef
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    // eslint-disable-next-line no-undef
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

export function renderMd(text) {
  // eslint-disable-next-line no-undef
  return marked.parse(text || '');
}

export function highlightCode(area) {
  // eslint-disable-next-line no-undef
  $$('pre code', area).forEach(el => hljs.highlightElement(el));
}

// ── Copy-to-clipboard ────────────────────────────────────────────
export function attachCopyButtons(area) {
  const targets = $$('.tool-code, .thinking-body, .md-content pre, .msg-assistant .msg-body pre', area);
  for (const el of targets) {
    if (el.querySelector('.copy-btn')) continue; // already attached
    const btn = document.createElement('button');
    btn.className = 'copy-btn on-dark';
    btn.type = 'button';
    btn.textContent = '⧉ copy';
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const text = el.innerText;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '✓ copied';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '⧉ copy'; btn.classList.remove('copied'); }, 1200);
      } catch {
        btn.textContent = 'failed';
      }
    });
    el.style.position = el.style.position || 'relative';
    el.appendChild(btn);
  }
}
