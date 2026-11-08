import { TraefikWorkspaceIndexer } from '../indexer';
import { TraefikRouter, TraefikService } from '../types';

export function openMatrixModal(indexer: TraefikWorkspaceIndexer, onOpenWizard: () => void) {
  const existing = document.getElementById('cs-traefik-matrix-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cs-traefik-matrix-overlay';
  overlay.className = 'cs-traefik-overlay';

  const modal = document.createElement('div');
  modal.className = 'cs-traefik-modal cs-traefik-modal-xl';

  function renderContent() {
    const index = indexer.getIndex();
    if (!index) {
      modal.innerHTML = `
        <div class="cs-traefik-loading">
          <div class="cs-traefik-spinner"></div>
          <div>Сканирование Traefik конфигураций...</div>
        </div>
      `;
      return;
    }

    const routers = Array.from(index.routers.values());
    const middlewares = Array.from(index.middlewares.values());
    const services = Array.from(index.services.values());
    const issues = index.issues || [];
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;

    modal.innerHTML = `
      <div class="cs-traefik-header">
        <div class="cs-traefik-header-left">
          <div class="cs-traefik-icon-badge">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
          <div>
            <h2 class="cs-traefik-title">Матрица правил Traefik</h2>
            <div class="cs-traefik-subtitle">Multi-File Directory Provider • ${index.files.length} файлов конфигурации</div>
          </div>
        </div>
        <div class="cs-traefik-header-actions">
          <button id="cs-traefik-btn-new-service" class="cs-traefik-btn cs-traefik-btn-primary">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Новый сервис
          </button>
          <button id="cs-traefik-btn-rescan" class="cs-traefik-btn cs-traefik-btn-secondary" title="Обновить граф правил">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
          <button id="cs-traefik-close-btn" class="cs-traefik-btn-icon" title="Закрыть (Esc)">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Stats Metrics Bar -->
      <div class="cs-traefik-stats">
        <div class="cs-traefik-stat-card">
          <div class="cs-traefik-stat-val">${routers.length}</div>
          <div class="cs-traefik-stat-label">Маршрутизаторов</div>
        </div>
        <div class="cs-traefik-stat-card">
          <div class="cs-traefik-stat-val">${services.length}</div>
          <div class="cs-traefik-stat-label">Сервисов бэкенда</div>
        </div>
        <div class="cs-traefik-stat-card">
          <div class="cs-traefik-stat-val">${middlewares.length}</div>
          <div class="cs-traefik-stat-label">Middlewares</div>
        </div>
        <div class="cs-traefik-stat-card ${errorCount > 0 ? 'cs-stat-error' : warnCount > 0 ? 'cs-stat-warn' : 'cs-stat-ok'}">
          <div class="cs-traefik-stat-val">${errorCount + warnCount}</div>
          <div class="cs-traefik-stat-label">${errorCount > 0 ? 'Ошибок ссылок' : warnCount > 0 ? 'Предупреждений' : 'Все ссылки валидны'}</div>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="cs-traefik-filter-bar">
        <div class="cs-traefik-search-box">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" id="cs-traefik-search-input" placeholder="Поиск по имени, хосту, бэкенду или middleware..." />
        </div>
        <div class="cs-traefik-filter-tabs">
          <button class="cs-traefik-filter-tab active" data-filter="all">Все (${routers.length})</button>
          <button class="cs-traefik-filter-tab" data-filter="tls">TLS (${routers.filter((r) => r.tls).length})</button>
          <button class="cs-traefik-filter-tab" data-filter="issues">Проблемы (${issues.length})</button>
        </div>
      </div>

      <!-- Issues Alert Banner (if any) -->
      ${
        issues.length > 0
          ? `
        <div class="cs-traefik-issues-banner">
          <div class="cs-traefik-issues-title">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Обнаружено проблем: ${issues.length}
          </div>
          <div class="cs-traefik-issues-list">
            ${issues
              .map(
                (issue) => `
              <div class="cs-traefik-issue-item ${issue.severity}" data-file="${escapeHtml(issue.file)}" data-line="${issue.line}">
                <span class="cs-traefik-issue-badge">${issue.code}</span>
                <span class="cs-traefik-issue-msg">${escapeHtml(issue.message)}</span>
                <span class="cs-traefik-issue-link">Перейти в ${getBasename(issue.file)}:${issue.line} &rarr;</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <!-- Routers & Services Table -->
      <div class="cs-traefik-table-wrap">
        <table class="cs-traefik-table" id="cs-traefik-matrix-table">
          <thead>
            <tr>
              <th>Статус</th>
              <th>Маршрутизатор & Файл</th>
              <th>Хост / Правило</th>
              <th>EntryPoints</th>
              <th>TLS</th>
              <th>Бэкенд (Service)</th>
              <th>Middlewares</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody id="cs-traefik-table-body">
            ${renderRows(routers, index)}
          </tbody>
        </table>
      </div>
    `;

    bindEvents();
  }

  function renderRows(routers: TraefikRouter[], index: any, searchQuery = '', filterMode = 'all'): string {
    const query = searchQuery.toLowerCase().trim();

    const filtered = routers.filter((r) => {
      if (filterMode === 'tls' && !r.tls) return false;
      if (filterMode === 'issues') {
        const hasIssue = index.issues?.some((i: any) => i.file === r.file && (i.line === r.line || i.message.includes(r.id)));
        if (!hasIssue) return false;
      }
      if (!query) return true;
      return (
        r.id.toLowerCase().includes(query) ||
        (r.host && r.host.toLowerCase().includes(query)) ||
        r.rule.toLowerCase().includes(query) ||
        r.service.toLowerCase().includes(query) ||
        r.file.toLowerCase().includes(query) ||
        r.middlewares.some((m) => m.toLowerCase().includes(query))
      );
    });

    if (filtered.length === 0) {
      return `
        <tr>
          <td colspan="8" class="cs-traefik-empty">
            Маршрутизаторы не найдены
          </td>
        </tr>
      `;
    }

    return filtered
      .map((r) => {
        const svc = index.services.get(r.service.replace(/@file$/, ''));
        const backendUrls = svc?.servers?.join(', ') || '—';

        // Check for broken middleware references
        const mwBadges = r.middlewares.map((mw) => {
          const clean = mw.replace(/@file$/, '');
          const exists = index.middlewares.has(clean);
          const mwDef = index.middlewares.get(clean);
          const title = exists ? `${clean} (${mwDef?.summary || mwDef?.type})` : `ОШИБКА: Middleware '${clean}' не найден в правилах!`;

          return `
            <span class="cs-traefik-mw-badge ${exists ? 'valid' : 'invalid'}" title="${escapeHtml(title)}" data-mw="${escapeHtml(mw)}" data-file="${escapeHtml(r.file)}" data-line="${r.middlewareLines?.[mw] || r.line}">
              ${escapeHtml(clean)}
              ${!exists ? '<span class="cs-mw-broken">✖</span>' : ''}
            </span>
          `;
        });

        // Check if this router has issues
        const routerIssues = index.issues?.filter((i: any) => i.file === r.file && (i.line === r.line || i.message.includes(r.id))) || [];
        const statusClass = routerIssues.length > 0 ? (routerIssues.some((i: any) => i.severity === 'error') ? 'error' : 'warn') : 'ok';

        return `
          <tr class="cs-traefik-row" data-file="${escapeHtml(r.file)}" data-line="${r.line}">
            <td>
              <span class="cs-traefik-status-dot ${statusClass}" title="${statusClass === 'ok' ? 'Валиден' : 'Есть проблемы'}"></span>
            </td>
            <td>
              <div class="cs-traefik-cell-main">
                <span class="cs-traefik-router-name">${escapeHtml(r.id)}</span>
                <span class="cs-traefik-file-link" data-file="${escapeHtml(r.file)}" data-line="${r.line}">
                  ${getBasename(r.file)}:${r.line}
                </span>
              </div>
            </td>
            <td>
              <div class="cs-traefik-cell-host" title="${escapeHtml(r.rule)}">
                ${r.host ? `<span class="cs-traefik-host-text">${escapeHtml(r.host)}</span>` : `<code class="cs-traefik-rule-code">${escapeHtml(r.rule)}</code>`}
              </div>
            </td>
            <td>
              ${r.entryPoints.map((ep) => `<span class="cs-traefik-ep-badge">${escapeHtml(ep)}</span>`).join(' ') || '<span class="cs-muted">—</span>'}
            </td>
            <td>
              ${
                r.tls
                  ? `<span class="cs-traefik-tls-badge" title="TLS Resolver: ${r.certResolver || 'Default'}">
                      <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                      ${r.certResolver || 'TLS'}
                    </span>`
                  : `<span class="cs-traefik-http-badge">HTTP</span>`
              }
            </td>
            <td>
              <div class="cs-traefik-backend-cell">
                <span class="cs-traefik-svc-name" title="${svc ? `${getBasename(svc.file)}:${svc.line}` : 'Не найден'}" data-file="${escapeHtml(svc?.file || r.file)}" data-line="${svc?.line || r.serviceLine || r.line}">
                  ${escapeHtml(r.service)}
                </span>
                <span class="cs-traefik-backend-url" title="${escapeHtml(backendUrls)}">${escapeHtml(backendUrls)}</span>
              </div>
            </td>
            <td>
              <div class="cs-traefik-mw-list">
                ${mwBadges.length > 0 ? mwBadges.join('') : '<span class="cs-muted">—</span>'}
              </div>
            </td>
            <td>
              <button class="cs-traefik-jump-btn" data-file="${escapeHtml(r.file)}" data-line="${r.line}">
                Открыть &rarr;
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function bindEvents() {
    const closeBtn = modal.querySelector('#cs-traefik-close-btn');
    closeBtn?.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const newBtn = modal.querySelector('#cs-traefik-btn-new-service');
    newBtn?.addEventListener('click', () => {
      closeModal();
      onOpenWizard();
    });

    const rescanBtn = modal.querySelector('#cs-traefik-btn-rescan');
    rescanBtn?.addEventListener('click', async () => {
      rescanBtn.classList.add('cs-spin');
      await indexer.scanWorkspace();
      renderContent();
    });

    // Search and filter tabs
    const searchInput = modal.querySelector('#cs-traefik-search-input') as HTMLInputElement;
    const filterTabs = modal.querySelectorAll('.cs-traefik-filter-tab');
    let currentFilter = 'all';

    function updateTable() {
      const index = indexer.getIndex();
      if (!index) return;
      const tbody = modal.querySelector('#cs-traefik-table-body');
      if (tbody) {
        tbody.innerHTML = renderRows(Array.from(index.routers.values()), index, searchInput?.value || '', currentFilter);
        attachJumpHandlers();
      }
    }

    searchInput?.addEventListener('input', updateTable);

    filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        filterTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.getAttribute('data-filter') || 'all';
        updateTable();
      });
    });

    attachJumpHandlers();
  }

  function attachJumpHandlers() {
    // 1-Click Jump to Editor with Line Flash
    modal.querySelectorAll('[data-file]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const file = el.getAttribute('data-file');
        const lineStr = el.getAttribute('data-line');
        const line = lineStr ? parseInt(lineStr, 10) : 1;

        if (file && (window as any).ConfigStudio?.openFile) {
          (window as any).ConfigStudio.openFile(file, { line, highlight: true });
          closeModal();
        }
      });
    });

    // Click on Middleware Badge -> Jump to Definition in mw-*.yml!
    modal.querySelectorAll('.cs-traefik-mw-badge').forEach((badge) => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const mwName = badge.getAttribute('data-mw');
        if (!mwName) return;
        const def = indexer.findDefinition(mwName);
        if (def && (window as any).ConfigStudio?.openFile) {
          (window as any).ConfigStudio.openFile(def.file, { line: def.line, highlight: true });
          closeModal();
        } else {
          // If not found in index, jump to reference in router
          const file = badge.getAttribute('data-file');
          const lineStr = badge.getAttribute('data-line');
          if (file && (window as any).ConfigStudio?.openFile) {
            (window as any).ConfigStudio.openFile(file, { line: lineStr ? parseInt(lineStr, 10) : 1, highlight: true });
            closeModal();
          }
        }
      });
    });
  }

  function closeModal() {
    document.removeEventListener('keydown', handleKey);
    overlay.remove();
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal();
  }

  document.addEventListener('keydown', handleKey);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  renderContent();
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getBasename(path: string): string {
  if (!path) return '';
  return path.split(/[\\/]/).pop() || path;
}
