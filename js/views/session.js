import { $, $$, escHtml, fmtTime, fmtDate, renderMd, highlightCode, attachCopyButtons, fmtUsd } from '../utils.js';
import { State } from '../state.js';
import { Api } from '../api.js';
import { pinButton } from './dashboard.js';

export async function renderSession(area, setBreadcrumb) {
  const { sub: sessionId, extra: dirName } = State;
  if (!sessionId || !dirName) { area.innerHTML = '<div class="empty">No session selected</div>'; return; }

  const proj = State.projects.find(p => p.dirName === dirName);
  const sessInfo = proj?.sessions.find(s => s.id === sessionId);
  setBreadcrumb(['Sessions', sessInfo?.title || sessionId.slice(0, 8)]);

  const records = await Api.session(dirName, sessionId);

  let html = `<div class="content-inner">
  <div>
    <div class="page-title">${escHtml(sessInfo?.title || 'Session')} ${sessInfo ? pinButton('session', sessionId, sessInfo.title, dirName) : ''}</div>
    <div class="page-sub">
      ${escHtml(sessionId)} ·
      ${sessInfo ? `${sessInfo.userCount + sessInfo.assistantCount} messages · ${sessInfo.toolCalls} tool calls` : ''}
      ${sessInfo?.usage?.estCostUsd ? ` · ${fmtUsd(sessInfo.usage.estCostUsd)} est.` : ''}
      ${sessInfo?.endTime ? ' · ' + fmtDate(sessInfo.endTime) : ''}
    </div>
  </div>`;

  html += `<div class="conversation">`;
  html += buildConversation(records);
  html += `</div></div>`;
  area.innerHTML = html;
  highlightCode(area);
  attachCopyButtons(area);

  // Wire up collapsible toggles
  $$('.thinking-toggle', area).forEach(el => el.addEventListener('click', () => {
    el.classList.toggle('open');
    el.nextElementSibling.classList.toggle('visible');
  }));
  $$('.tool-header', area).forEach(el => el.addEventListener('click', () => {
    el.querySelector('.tool-chevron').classList.toggle('open');
    el.nextElementSibling.classList.toggle('visible');
  }));

  // Jump-to-highlight, if navigated here from a search result
  if (State._jumpToRecordIndex != null) {
    const target = $(`[data-record-index="${State._jumpToRecordIndex}"]`, area);
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.classList.add('search-jump-highlight');
      setTimeout(() => target.classList.remove('search-jump-highlight'), 1600);
    }
    State._jumpToRecordIndex = null;
  }
}

function buildConversation(records) {
  // Split into segments by ai-title records
  const segments = [];
  let current = { title: null, messages: [] };

  records.forEach((rec, recordIndex) => {
    if (rec.type === 'ai-title') {
      // ai-title records get re-emitted periodically even when the title text
      // hasn't changed — only treat it as a real segment boundary if it did.
      if (rec.aiTitle && rec.aiTitle !== current.title) {
        if (current.messages.length) segments.push(current);
        current = { title: rec.aiTitle, messages: [] };
      }
    } else if (rec.type === 'user' || rec.type === 'assistant') {
      current.messages.push({ rec, recordIndex });
    }
  });
  if (current.messages.length) segments.push(current);

  if (!segments.length) return '<div class="empty">No messages</div>';

  // Build tool_use id -> tool_result map for matching
  const toolResults = {};
  for (const seg of segments) {
    for (const { rec } of seg.messages) {
      if (rec.type === 'user') {
        const content = rec.message?.content;
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c.type === 'tool_result') toolResults[c.tool_use_id] = c;
          }
        }
      }
    }
  }

  let html = '';
  for (const seg of segments) {
    html += `<div class="conv-segment">`;
    if (seg.title) html += `<div class="conv-segment-title">${escHtml(seg.title)}</div>`;

    // Consecutive assistant records (thinking → tool_use → tool_use → text) are one
    // logical reply turn in the transcript — render them under a single header instead
    // of a stacked header per record. A run only breaks on a *visible* user message;
    // pure tool_result records are plumbing between tool calls in the same turn.
    let run = [];
    const flushRun = () => { if (run.length) { html += renderAssistantGroup(run, toolResults); run = []; } };

    for (const { rec, recordIndex } of seg.messages) {
      if (rec.type === 'user') {
        if (hasVisibleUserContent(rec)) {
          flushRun();
          html += renderUserMsg(rec, recordIndex);
        }
      } else if (rec.type === 'assistant') {
        run.push({ rec, recordIndex });
      }
    }
    flushRun();
    html += `</div>`;
  }
  return html;
}

function hasVisibleUserContent(rec) {
  const content = rec.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  if (Array.isArray(content)) return content.some(c => c.type === 'text' || c.type === 'image');
  return false;
}

function renderUserMsg(rec, recordIndex) {
  const content = rec.message?.content;
  const ts = rec.timestamp ? fmtTime(new Date(rec.timestamp).getTime()) : '';
  let body = '';

  if (typeof content === 'string') {
    body = `<div class="msg-user"><div class="msg-header">You <span class="ts">${ts}</span></div><div class="msg-body">${escHtml(content)}</div></div>`;
  } else if (Array.isArray(content)) {
    const textBlocks = content.filter(c => c.type === 'text');
    const imgBlocks = content.filter(c => c.type === 'image');

    // Only show user messages that have text or images (not pure tool_result turns)
    if (!textBlocks.length && !imgBlocks.length) return '';

    let inner = textBlocks.map(c => escHtml(c.text)).join('\n');
    for (const img of imgBlocks) {
      if (img.source?.type === 'base64') {
        inner += `<div class="img-block"><img src="data:${img.source.media_type};base64,${img.source.data}" alt="image" loading="lazy"></div>`;
      }
    }
    body = `<div class="msg-user"><div class="msg-header">You <span class="ts">${ts}</span></div><div class="msg-body">${inner}</div></div>`;
  }
  return `<div class="msg" data-record-index="${recordIndex}">${body}</div>`;
}

function renderContentBlocks(content, toolResults) {
  let inner = '';
  for (const block of content) {
    if (block.type === 'text') {
      inner += `<div>${renderMd(block.text)}</div>`;
    } else if (block.type === 'thinking') {
      inner += `<div class="thinking-block">
        <div class="thinking-toggle">
          <span>💭</span> <span>Thinking</span> <span class="chevron">▶</span>
        </div>
        <div class="thinking-body">${escHtml(block.thinking || '')}</div>
      </div>`;
    } else if (block.type === 'tool_use') {
      const result = toolResults[block.id];
      inner += renderToolCall(block, result);
    }
  }
  return inner;
}

// Renders one logical reply turn from a run of consecutive assistant records.
// The outer .msg keeps the first record's index; later records get their own
// addressable wrapper so search jump-to-highlight can still target any record.
function renderAssistantGroup(group, toolResults) {
  const first = group[0];
  const ts = first.rec.timestamp ? fmtTime(new Date(first.rec.timestamp).getTime()) : '';
  const model = group.map(g => g.rec.message?.model).find(Boolean) || '';

  let inTok = 0, outTok = 0, inner = '';
  group.forEach(({ rec, recordIndex }, i) => {
    const usage = rec.message?.usage;
    if (usage) {
      inTok += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
      outTok += usage.output_tokens || 0;
    }
    const content = rec.message?.content;
    if (!Array.isArray(content)) return;
    const blockHtml = renderContentBlocks(content, toolResults);
    if (!blockHtml) return;
    inner += i === 0 ? blockHtml : `<div data-record-index="${recordIndex}">${blockHtml}</div>`;
  });

  if (!inner) return '';

  const meta = [];
  if (model) meta.push(model.replace('claude-', ''));
  if (inTok || outTok) meta.push(`↑${inTok} ↓${outTok} tokens`);

  return `<div class="msg msg-assistant" data-record-index="${first.recordIndex}">
    <div class="msg-header">
      Claude <span class="ts">${ts}</span>
      ${meta.map(m => `<span class="ts">${escHtml(m)}</span>`).join('')}
    </div>
    <div class="msg-body">${inner}</div>
  </div>`;
}

function renderToolCall(block, result) {
  const inputStr = JSON.stringify(block.input, null, 2);
  let resultHtml = '';
  if (result) {
    const isError = result.is_error;
    const resultContent = result.content;
    let resultStr = '';
    if (typeof resultContent === 'string') resultStr = resultContent;
    else if (Array.isArray(resultContent)) {
      resultStr = resultContent.filter(c => c.type === 'text').map(c => c.text).join('\n');
    } else if (resultContent) resultStr = JSON.stringify(resultContent, null, 2);

    const maxLen = 4000;
    const truncated = resultStr.length > maxLen;
    if (truncated) resultStr = resultStr.slice(0, maxLen) + `\n\n… [${(resultStr.length / 1024).toFixed(1)} KB total, truncated]`;

    resultHtml = `<div class="tool-result-${isError ? 'err' : 'ok'}">
      <div class="tool-section-label">${isError ? '✗ Error' : '✓ Result'}</div>
      <div class="tool-code">${escHtml(resultStr)}</div>
    </div>`;
  }

  return `<div class="tool-block">
    <div class="tool-header">
      <span style="font-size:13px">🔧</span>
      <span class="tool-name">${escHtml(block.name)}</span>
      <span class="tool-chevron">▶</span>
    </div>
    <div class="tool-body">
      <div class="tool-section-label">Input</div>
      <div class="tool-code">${escHtml(inputStr)}</div>
      ${resultHtml}
    </div>
  </div>`;
}
