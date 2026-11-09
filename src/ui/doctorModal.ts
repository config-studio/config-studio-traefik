import { queryTraefikApi, runLocalAudit, TraefikDoctorReport } from '../doctor';
import { TraefikWorkspaceIndexer } from '../indexer';

export function openDoctorModal(indexer: TraefikWorkspaceIndexer, onOpenMatrix?: () => void) {
  const existing = document.getElementById('cs-traefik-doctor-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cs-traefik-doctor-overlay';
  overlay.className = 'cs-traefik-overlay';

  const modal = document.createElement('div');
  modal.className = 'cs-traefik-modal cs-traefik-modal-xl';

  const defaultApiUrl = localStorage.getItem('cs_traefik_api_url') || 'http://localhost:8080';
  let report: TraefikDoctorReport = runLocalAudit(indexer.getIndex());
  let isCheckingApi = false;

  function render() {
    const cs = (window as any).ConfigStudio;
    const { localSummary, issues, apiStatus, overallStatus } = report;

    let overallBadgeClass = 'cs-status-healthy';
    let overallBadgeText = 'HEALTHY: Все ссылки и правила в норме';
    if (overallStatus === 'error' || apiStatus.runtimeErrors.length > 0) {
      overallBadgeClass = 'cs-status-error';
      overallBadgeText = 'ISSUES FOUND: Обнаружены критические ошибки';
    } else if (overallStatus === 'warning' || (apiStatus.checked && !apiStatus.reachable)) {
      overallBadgeClass = 'cs-status-warning';
      overallBadgeText = 'WARNING: Обнаружены предупреждения';
    }

    modal.innerHTML = `
      <div class="cs-traefik-header">
        <div class="cs-traefik-header-left">
          <div class="cs-traefik-icon-badge" style="background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.35); color: #10b981;">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <div>
            <h2 class="cs-traefik-title">Traefik Doctor & Diagnostics</h2>
            <div class="cs-traefik-subtitle">Локальный аудит целостности конфигурации и сверка с Traefik REST API</div>
          </div>
        </div>
        <div class="cs-traefik-header-actions">
          <span class="cs-doctor-badge ${overallBadgeClass}">${overallBadgeText}</span>
          <button id="cs-doctor-rescan-btn" class="cs-traefik-btn cs-traefik-btn-secondary" title="Обновить аудит">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Пересканировать
          </button>
          <button id="cs-doctor-close-btn" class="cs-traefik-btn-icon" title="Закрыть">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Metrics Row -->
      <div class="cs-doctor-metrics-grid">
        <div class="cs-doctor-metric-card">
          <div class="cs-metric-num">${localSummary.routersCount}</div>
          <div class="cs-metric-label">Маршрутизаторы (Routers)</div>
        </div>
        <div class="cs-doctor-metric-card">
          <div class="cs-metric-num">${localSummary.servicesCount}</div>
          <div class="cs-metric-label">Сервисы бэкенда (Services)</div>
        </div>
        <div class="cs-doctor-metric-card">
          <div class="cs-metric-num">${localSummary.middlewaresCount}</div>
          <div class="cs-metric-label">Правила (Middlewares)</div>
        </div>
        <div class="cs-doctor-metric-card ${localSummary.errorsCount > 0 ? 'cs-metric-error' : localSummary.warningsCount > 0 ? 'cs-metric-warn' : 'cs-metric-ok'}">
          <div class="cs-metric-num">${localSummary.issuesCount}</div>
          <div class="cs-metric-label">Замечаний линтера (${localSummary.errorsCount} ош., ${localSummary.warningsCount} пред.)</div>
        </div>
      </div>

      <!-- Main Scrollable Body -->
      <div class="cs-doctor-body">
        <!-- Section 1: Local Rules Audit -->
        <div class="cs-doctor-section">
          <div class="cs-section-header">
            <div class="cs-section-title">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              Локальный аудит целостности ссылок (Local Linter)
            </div>
            <span class="cs-section-badge">${issues.length} найдено</span>
          </div>

          ${
            issues.length === 0
              ? `
            <div class="cs-doctor-clean-state">
              <div class="cs-clean-icon">
                <svg width="32" height="32" fill="none" stroke="#10b981" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div class="cs-clean-title">Ошибок целостности не обнаружено</div>
              <div class="cs-clean-desc">Все ссылки на middlewares (@file) и бэкенд-сервисы валидны. Коллизий Host() на одинаковых EntryPoints без приоритета не найдено.</div>
            </div>
          `
              : `
            <div class="cs-doctor-issues-table-wrap">
              <table class="cs-traefik-table">
                <thead>
                  <tr>
                    <th style="width: 110px;">Статус</th>
                    <th style="width: 170px;">Код проверки</th>
                    <th>Описание проблемы</th>
                    <th style="width: 220px;">Файл и строка</th>
                    <th style="width: 80px; text-align: center;">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  ${issues
                    .map(
                      (iss) => `
                    <tr>
                      <td>
                        <span class="cs-traefik-issue-badge ${iss.severity === 'error' ? 'cs-issue-err' : 'cs-issue-warn'}">
                          ${iss.severity.toUpperCase()}
                        </span>
                      </td>
                      <td><code>${iss.code}</code></td>
                      <td>${escapeHtml(iss.message)}</td>
                      <td><code class="cs-traefik-file-link">${escapeHtml(iss.file)}:${iss.line}</code></td>
                      <td style="text-align: center;">
                        <button class="cs-traefik-jump-btn" data-jump-file="${escapeHtml(iss.file)}" data-jump-line="${iss.line}">
                          Перейти
                        </button>
                      </td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
          }
        </div>

        <!-- Section 2: Traefik REST API Health -->
        <div class="cs-doctor-section" style="margin-top: 20px;">
          <div class="cs-section-header">
            <div class="cs-section-title">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              Traefik REST API & Runtime Health Check
            </div>
            <div class="cs-api-input-wrap">
              <input type="text" id="cs-doctor-api-url" class="cs-api-input" value="${escapeHtml(
                apiStatus.url || defaultApiUrl
              )}" placeholder="http://localhost:8080" />
              <button id="cs-doctor-test-api-btn" class="cs-traefik-btn cs-traefik-btn-primary" ${
                isCheckingApi ? 'disabled' : ''
              }>
                ${isCheckingApi ? 'Проверка...' : 'Проверить API'}
              </button>
            </div>
          </div>

          <div class="cs-api-results-box">
            ${
              !apiStatus.checked
                ? `
              <div class="cs-doctor-hint-box">
                <svg width="18" height="18" fill="none" stroke="#38bdf8" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>Нажмите <strong>«Проверить API»</strong> для прямого запроса к рантайму Traefik (эндпоинты <code>/api/version</code>, <code>/api/overview</code>, <code>/api/rawdata</code>).</span>
              </div>
            `
                : apiStatus.reachable
                ? `
              <div class="cs-api-details-grid">
                <div class="cs-api-detail-item">
                  <div class="cs-detail-label">Версия Traefik</div>
                  <div class="cs-detail-val"><code>${escapeHtml(apiStatus.version || 'Unknown')}</code></div>
                </div>
                <div class="cs-api-detail-item">
                  <div class="cs-detail-label">Активных Routers (HTTP)</div>
                  <div class="cs-detail-val">${apiStatus.overview?.httpRoutersTotal ?? 'н/д'}</div>
                </div>
                <div class="cs-api-detail-item">
                  <div class="cs-detail-label">Активных Services (HTTP)</div>
                  <div class="cs-detail-val">${apiStatus.overview?.httpServicesTotal ?? 'н/д'}</div>
                </div>
                <div class="cs-api-detail-item">
                  <div class="cs-detail-label">Активных Middlewares (HTTP)</div>
                  <div class="cs-detail-val">${apiStatus.overview?.httpMiddlewaresTotal ?? 'н/д'}</div>
                </div>
              </div>

              ${
                apiStatus.runtimeErrors.length > 0
                  ? `
                <div class="cs-runtime-errors-alert">
                  <div class="cs-alert-title">Обнаружены ошибки рантайма Traefik (${apiStatus.runtimeErrors.length}):</div>
                  <ul class="cs-alert-list">
                    ${apiStatus.runtimeErrors
                      .map(
                        (err) => `
                      <li>
                        <strong>[${err.type.toUpperCase()}] ${escapeHtml(err.name)}</strong> (статус: ${escapeHtml(
                          err.status
                        )}):
                        ${escapeHtml(err.errors?.join('; ') || 'Отключен или содержит ошибку компиляции')}
                      </li>
                    `
                      )
                      .join('')}
                  </ul>
                </div>
              `
                  : `
                <div class="cs-runtime-ok-alert">
                  Все конфигурации в памяти Traefik работают штатно (статус enabled, 0 ошибок компиляции).
                </div>
              `
              }

              ${
                apiStatus.unloadedConfigs.length > 0
                  ? `
                <div class="cs-runtime-warn-alert">
                  <div class="cs-alert-title">Несоответствия файлов и рантайма (${apiStatus.unloadedConfigs.length}):</div>
                  <ul class="cs-alert-list">
                    ${apiStatus.unloadedConfigs.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}
                  </ul>
                </div>
              `
                  : ''
              }
            `
                : `
              <div class="cs-api-error-card">
                <div class="cs-error-icon">
                  <svg width="24" height="24" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                <div>
                  <div class="cs-error-title">Traefik API недоступен по адресу: <code>${escapeHtml(apiStatus.url)}</code></div>
                  <div class="cs-error-desc">${escapeHtml(apiStatus.error || 'Connection failed')}</div>
                  <div class="cs-error-hint">
                    Убедитесь, что Traefik запущен и в его конфигурации разрешен REST API:<br/>
                    <code>api: { insecure: true, dashboard: true }</code> (порт 8080 по умолчанию).
                  </div>
                </div>
              </div>
            `
            }
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="cs-traefik-footer">
        <button id="cs-doctor-matrix-btn" class="cs-traefik-btn cs-traefik-btn-secondary">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
          </svg>
          Матрица правил
        </button>
        <button id="cs-doctor-dashboard-btn" class="cs-traefik-btn cs-traefik-btn-secondary">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Открыть Dashboard
        </button>
        <button id="cs-doctor-footer-close-btn" class="cs-traefik-btn cs-traefik-btn-primary">
          Закрыть
        </button>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const cs = (window as any).ConfigStudio;

    const close = () => {
      document.removeEventListener('keydown', handleKey);
      overlay.remove();
    };

    modal.querySelector('#cs-doctor-close-btn')?.addEventListener('click', close);
    modal.querySelector('#cs-doctor-footer-close-btn')?.addEventListener('click', close);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Rescan button
    modal.querySelector('#cs-doctor-rescan-btn')?.addEventListener('click', async () => {
      await indexer.scanWorkspace();
      report = runLocalAudit(indexer.getIndex());
      render();
    });

    // Test API button
    modal.querySelector('#cs-doctor-test-api-btn')?.addEventListener('click', async () => {
      const input = modal.querySelector('#cs-doctor-api-url') as HTMLInputElement;
      const url = input?.value.trim() || 'http://localhost:8080';
      localStorage.setItem('cs_traefik_api_url', url);

      isCheckingApi = true;
      render();

      try {
        const apiStatus = await queryTraefikApi(url, indexer.getIndex());
        report.apiStatus = apiStatus;
      } catch (err: any) {
        report.apiStatus = {
          checked: true,
          reachable: false,
          url,
          runtimeErrors: [],
          unloadedConfigs: [],
          error: err?.message || String(err),
        };
      } finally {
        isCheckingApi = false;
        render();
      }
    });

    // Matrix button
    modal.querySelector('#cs-doctor-matrix-btn')?.addEventListener('click', () => {
      close();
      if (onOpenMatrix) onOpenMatrix();
    });

    // Open Dashboard button
    modal.querySelector('#cs-doctor-dashboard-btn')?.addEventListener('click', () => {
      const input = modal.querySelector('#cs-doctor-api-url') as HTMLInputElement;
      const url = (input?.value.trim() || defaultApiUrl).replace(/\/+$/, '');
      const dashboardUrl = `${url}/dashboard/`;
      window.open(dashboardUrl, '_blank');
    });

    // Jump buttons
    const jumpBtns = modal.querySelectorAll('[data-jump-file]');
    jumpBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filePath = btn.getAttribute('data-jump-file');
        const line = Number(btn.getAttribute('data-jump-line')) || 1;
        if (filePath && cs?.openFile) {
          cs.openFile(filePath, { line, highlight: true });
          close();
        }
      });
    });
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', handleKey);
      overlay.remove();
    }
  }

  document.addEventListener('keydown', handleKey);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  render();
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
