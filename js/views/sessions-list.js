import { escHtml } from '../utils.js';
import { State } from '../state.js';
import { icon } from '../icons.js';
import { sessionCard } from './dashboard.js';

export async function renderSessionsList(area, setBreadcrumb) {
  setBreadcrumb(['Sessions']);
  const projects = State.projects;
  const total = projects.reduce((s, p) => s + p.sessions.length, 0);

  let html = `<div class="content-inner">
    <div>
      <div class="page-title page-title--hero">Sessions</div>
      <div class="page-sub">${total} session${total !== 1 ? 's' : ''} across ${projects.length} project${projects.length !== 1 ? 's' : ''}</div>
    </div>`;

  if (!total) {
    html += `<div class="empty">No sessions found</div>`;
  } else {
    for (const proj of projects) {
      if (!proj.sessions.length) continue;
      const projectName = proj.projectPath.split('/').pop() || proj.projectPath;
      html += `<div>
        <div class="project-group-label">
          ${icon('folder', { size: 13 })}
          <span title="${escHtml(proj.projectPath)}">${escHtml(projectName)}</span>
          <span class="badge" style="margin-left:auto">${proj.sessions.length}</span>
        </div>
        <div class="session-list">`;
      const sorted = [...proj.sessions].sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
      for (const sess of sorted) html += sessionCard({ ...sess, dirName: proj.dirName });
      html += `</div></div>`;
    }
  }

  html += `</div>`;
  area.innerHTML = html;
}
