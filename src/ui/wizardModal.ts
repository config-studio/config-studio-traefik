import { generateMiddlewareYaml, generateServiceYaml, MIDDLEWARE_BLUEPRINTS } from '../generator';
import { TraefikWorkspaceIndexer } from '../indexer';
import { MiddlewareRecipeType, NewServiceConfig } from '../types';

export function openWizardModal(
  indexer: TraefikWorkspaceIndexer,
  onCreated?: (filePath: string) => void,
  initialMode: 'service' | 'blueprint' = 'service'
) {
  const existing = document.getElementById('cs-traefik-wizard-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cs-traefik-wizard-overlay';
  overlay.className = 'cs-traefik-overlay';

  const modal = document.createElement('div');
  modal.className = 'cs-traefik-modal cs-traefik-modal-lg';

  const index = indexer.getIndex();
  const availableMiddlewares = index ? Array.from(index.middlewares.values()) : [];
  const rulesDir = index?.rulesDir || 'rules';

  let currentMode: 'service' | 'blueprint' = initialMode;

  // Service form state
  const serviceState: NewServiceConfig = {
    name: 'myservice',
    host: 'myservice.example.com',
    targetUrl: 'http://127.0.0.1:8080',
    entryPoint: 'websecure',
    enableTls: true,
    certResolver: 'letsencrypt',
    middlewares: availableMiddlewares.length > 0 ? [availableMiddlewares[0].id] : [],
    rulesSubdir: rulesDir,
  };

  // Blueprint form state
  let selectedBlueprintType: MiddlewareRecipeType = 'security-headers';
  const blueprintParams: Record<string, any> = {};
  // Initialize default params for the first blueprint
  const initialBp = MIDDLEWARE_BLUEPRINTS[0];
  initialBp.fields.forEach((f) => {
    blueprintParams[f.key] = f.defaultValue;
  });
  let blueprintName = initialBp.defaultName;

  function renderModal() {
    modal.innerHTML = `
      <div class="cs-traefik-header">
        <div class="cs-traefik-header-left">
          <div class="cs-traefik-icon-badge">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
          </div>
          <div>
            <h2 class="cs-traefik-title">Мастер Traefik Dynamic & Blueprints</h2>
            <div class="cs-traefik-subtitle">Конструктор сервисов (ser-*.yml) и рецепты готовых правил (mw-*.yml)</div>
          </div>
        </div>
        <button id="cs-wizard-close-btn" class="cs-traefik-btn-icon" title="Закрыть">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Mode Switcher Tabs -->
      <div class="cs-wizard-tabs-bar">
        <button id="cs-mode-btn-service" class="cs-wizard-tab-btn ${currentMode === 'service' ? 'active' : ''}">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
          </svg>
          Сервис (ser-*.yml)
        </button>
        <button id="cs-mode-btn-blueprint" class="cs-wizard-tab-btn ${currentMode === 'blueprint' ? 'active' : ''}">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          Рецепты Middleware (mw-*.yml)
        </button>
      </div>

      <div class="cs-wizard-body">
        <!-- Left Column: Form -->
        <div class="cs-wizard-form" id="cs-wizard-form-container">
          ${currentMode === 'service' ? renderServiceForm() : renderBlueprintForm()}
        </div>

        <!-- Right Column: Live YAML Preview -->
        <div class="cs-wizard-preview">
          <div class="cs-preview-header">
            <span class="cs-preview-title">Предпросмотр YAML</span>
            <span class="cs-preview-badge" id="cs-preview-badge-type">${
              currentMode === 'service' ? 'Traefik Service' : 'Traefik Middleware'
            }</span>
          </div>
          <pre class="cs-preview-code"><code id="cs-wizard-preview-code"></code></pre>
        </div>
      </div>

      <div class="cs-traefik-footer">
        <button id="cs-wizard-cancel-btn" class="cs-traefik-btn cs-traefik-btn-secondary">Отмена</button>
        <button id="cs-wizard-submit-btn" class="cs-traefik-btn cs-traefik-btn-primary">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <span id="cs-wizard-submit-label">${
            currentMode === 'service' ? 'Создать ser-файл и открыть' : 'Создать mw-файл и открыть'
          }</span>
        </button>
      </div>
    `;

    bindEvents();
    updatePreview();
  }

  function renderServiceForm(): string {
    return `
      <div class="cs-form-group">
        <label class="cs-form-label">Имя сервиса (slug)</label>
        <input type="text" id="cs-wizard-name" class="cs-form-input" value="${escapeHtml(
          serviceState.name
        )}" placeholder="jellyfin, vaultwarden, api..." />
        <div class="cs-form-hint">Будет создан файл: <code id="cs-wizard-target-filename">${getTargetServiceFilename(
          serviceState.rulesSubdir,
          serviceState.name
        )}</code></div>
      </div>

      <div class="cs-form-group">
        <label class="cs-form-label">Домен / Host</label>
        <input type="text" id="cs-wizard-host" class="cs-form-input" value="${escapeHtml(
          serviceState.host
        )}" placeholder="subdomain.domain.tld" />
      </div>

      <div class="cs-form-group">
        <label class="cs-form-label">Бэкенд URL (loadBalancer)</label>
        <input type="text" id="cs-wizard-url" class="cs-form-input" value="${escapeHtml(
          serviceState.targetUrl
        )}" placeholder="http://192.168.1.50:8080" />
      </div>

      <div class="cs-form-row">
        <div class="cs-form-group cs-col-6">
          <label class="cs-form-label">EntryPoint</label>
          <select id="cs-wizard-entrypoint" class="cs-form-select">
            <option value="websecure" ${serviceState.entryPoint === 'websecure' ? 'selected' : ''}>websecure (443 / HTTPS)</option>
            <option value="web" ${serviceState.entryPoint === 'web' ? 'selected' : ''}>web (80 / HTTP)</option>
            <option value="traefik" ${serviceState.entryPoint === 'traefik' ? 'selected' : ''}>traefik (Dashboard)</option>
          </select>
        </div>
        <div class="cs-form-group cs-col-6">
          <label class="cs-form-label">Каталог правил</label>
          <input type="text" id="cs-wizard-rules-dir" class="cs-form-input" value="${escapeHtml(
            serviceState.rulesSubdir || 'rules'
          )}" />
        </div>
      </div>

      <div class="cs-form-group cs-tls-box">
        <label class="cs-checkbox-label">
          <input type="checkbox" id="cs-wizard-tls" ${serviceState.enableTls ? 'checked' : ''} />
          <span class="cs-checkbox-custom"></span>
          <span class="cs-checkbox-text">Включить автоматический TLS сертификат</span>
        </label>
        <div id="cs-wizard-tls-fields" style="${serviceState.enableTls ? '' : 'display:none;'}margin-top:8px;">
          <label class="cs-form-label-sub">CertResolver</label>
          <input type="text" id="cs-wizard-cert-resolver" class="cs-form-input" value="${escapeHtml(
            serviceState.certResolver
          )}" placeholder="letsencrypt" />
        </div>
      </div>

      <!-- Middlewares Checklist -->
      <div class="cs-form-group">
        <label class="cs-form-label">
          Подключить Middlewares
          <span class="cs-label-badge">${availableMiddlewares.length} найдено</span>
        </label>
        <div class="cs-mw-checkbox-grid">
          ${
            availableMiddlewares.length > 0
              ? availableMiddlewares
                  .map(
                    (mw) => `
              <label class="cs-mw-checkbox-card ${serviceState.middlewares.includes(mw.id) ? 'selected' : ''}">
                <input type="checkbox" class="cs-mw-checkbox" value="${escapeHtml(mw.id)}" ${
                      serviceState.middlewares.includes(mw.id) ? 'checked' : ''
                    } />
                <div class="cs-mw-info">
                  <div class="cs-mw-name">${escapeHtml(mw.id)}</div>
                  <div class="cs-mw-type">${escapeHtml(mw.summary || mw.type)}</div>
                </div>
              </label>
            `
                  )
                  .join('')
              : `<div class="cs-muted-box">Middlewares не найдены в workspace. Перейдите во вкладку «Рецепты Middleware» для создания!</div>`
          }
        </div>
      </div>
    `;
  }

  function renderBlueprintForm(): string {
    const currentBp = MIDDLEWARE_BLUEPRINTS.find((b) => b.type === selectedBlueprintType) || MIDDLEWARE_BLUEPRINTS[0];

    return `
      <div class="cs-form-group">
        <label class="cs-form-label">Выберите готовый рецепт Middleware</label>
        <div class="cs-blueprint-selector-grid">
          ${MIDDLEWARE_BLUEPRINTS.map(
            (bp) => `
            <div class="cs-bp-card ${bp.type === selectedBlueprintType ? 'selected' : ''}" data-bp-type="${bp.type}">
              <div class="cs-bp-card-title">${escapeHtml(bp.title)}</div>
              <div class="cs-bp-card-desc">${escapeHtml(bp.description)}</div>
            </div>
          `
          ).join('')}
        </div>
      </div>

      <div class="cs-form-group" style="margin-top: 6px;">
        <label class="cs-form-label">Имя Middleware</label>
        <input type="text" id="cs-bp-name-input" class="cs-form-input" value="${escapeHtml(blueprintName)}" />
        <div class="cs-form-hint">Будет создан файл: <code id="cs-wizard-target-filename">${getTargetMiddlewareFilename(
          serviceState.rulesSubdir,
          blueprintName
        )}</code></div>
      </div>

      <!-- Dynamic Blueprint Fields -->
      <div class="cs-bp-fields-box">
        ${currentBp.fields
          .map((f) => {
            const val = blueprintParams[f.key] !== undefined ? blueprintParams[f.key] : f.defaultValue;
            if (f.type === 'boolean') {
              return `
                <div class="cs-form-group">
                  <label class="cs-checkbox-label">
                    <input type="checkbox" class="cs-bp-field" data-field-key="${f.key}" ${val ? 'checked' : ''} />
                    <span class="cs-checkbox-custom"></span>
                    <span class="cs-checkbox-text">${escapeHtml(f.label)}</span>
                  </label>
                  ${f.hint ? `<div class="cs-form-hint">${escapeHtml(f.hint)}</div>` : ''}
                </div>
              `;
            } else if (f.type === 'textarea') {
              return `
                <div class="cs-form-group">
                  <label class="cs-form-label">${escapeHtml(f.label)}</label>
                  <textarea class="cs-form-input cs-form-textarea cs-bp-field" data-field-key="${f.key}" rows="3" placeholder="${escapeHtml(
                f.placeholder || ''
              )}">${escapeHtml(String(val))}</textarea>
                  ${f.hint ? `<div class="cs-form-hint">${escapeHtml(f.hint)}</div>` : ''}
                </div>
              `;
            } else {
              return `
                <div class="cs-form-group">
                  <label class="cs-form-label">${escapeHtml(f.label)}</label>
                  <input type="${f.type === 'number' ? 'number' : 'text'}" class="cs-form-input cs-bp-field" data-field-key="${
                f.key
              }" value="${escapeHtml(String(val))}" placeholder="${escapeHtml(f.placeholder || '')}" />
                  ${f.hint ? `<div class="cs-form-hint">${escapeHtml(f.hint)}</div>` : ''}
                </div>
              `;
            }
          })
          .join('')}
      </div>
    `;
  }

  function updatePreview() {
    const codeEl = modal.querySelector('#cs-wizard-preview-code');
    const badgeEl = modal.querySelector('#cs-preview-badge-type');
    const targetEl = modal.querySelector('#cs-wizard-target-filename');

    if (currentMode === 'service') {
      const yaml = generateServiceYaml(serviceState);
      if (codeEl) codeEl.textContent = yaml;
      if (badgeEl) badgeEl.textContent = 'Traefik Service';
      if (targetEl) targetEl.textContent = getTargetServiceFilename(serviceState.rulesSubdir, serviceState.name);
    } else {
      const yaml = generateMiddlewareYaml(selectedBlueprintType, blueprintName, blueprintParams);
      if (codeEl) codeEl.textContent = yaml;
      if (badgeEl) badgeEl.textContent = 'Traefik Middleware';
      if (targetEl) targetEl.textContent = getTargetMiddlewareFilename(serviceState.rulesSubdir, blueprintName);
    }
  }

  function bindEvents() {
    const close = () => {
      document.removeEventListener('keydown', handleKey);
      overlay.remove();
    };

    modal.querySelector('#cs-wizard-close-btn')?.addEventListener('click', close);
    modal.querySelector('#cs-wizard-cancel-btn')?.addEventListener('click', close);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Tab buttons
    modal.querySelector('#cs-mode-btn-service')?.addEventListener('click', () => {
      if (currentMode !== 'service') {
        currentMode = 'service';
        renderModal();
      }
    });

    modal.querySelector('#cs-mode-btn-blueprint')?.addEventListener('click', () => {
      if (currentMode !== 'blueprint') {
        currentMode = 'blueprint';
        renderModal();
      }
    });

    if (currentMode === 'service') {
      // Service form inputs
      const nameInput = modal.querySelector('#cs-wizard-name') as HTMLInputElement;
      nameInput?.addEventListener('input', () => {
        serviceState.name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9\-]/g, '-');
        updatePreview();
      });

      const hostInput = modal.querySelector('#cs-wizard-host') as HTMLInputElement;
      hostInput?.addEventListener('input', () => {
        serviceState.host = hostInput.value.trim();
        updatePreview();
      });

      const urlInput = modal.querySelector('#cs-wizard-url') as HTMLInputElement;
      urlInput?.addEventListener('input', () => {
        serviceState.targetUrl = urlInput.value.trim();
        updatePreview();
      });

      const epSelect = modal.querySelector('#cs-wizard-entrypoint') as HTMLSelectElement;
      epSelect?.addEventListener('change', () => {
        serviceState.entryPoint = epSelect.value;
        updatePreview();
      });

      const rulesDirInput = modal.querySelector('#cs-wizard-rules-dir') as HTMLInputElement;
      rulesDirInput?.addEventListener('input', () => {
        serviceState.rulesSubdir = rulesDirInput.value.trim();
        updatePreview();
      });

      const tlsCheckbox = modal.querySelector('#cs-wizard-tls') as HTMLInputElement;
      const tlsFields = modal.querySelector('#cs-wizard-tls-fields') as HTMLElement;
      tlsCheckbox?.addEventListener('change', () => {
        serviceState.enableTls = tlsCheckbox.checked;
        if (tlsFields) tlsFields.style.display = serviceState.enableTls ? '' : 'none';
        updatePreview();
      });

      const certInput = modal.querySelector('#cs-wizard-cert-resolver') as HTMLInputElement;
      certInput?.addEventListener('input', () => {
        serviceState.certResolver = certInput.value.trim();
        updatePreview();
      });

      // Middleware checkboxes
      const mwCheckboxes = modal.querySelectorAll('.cs-mw-checkbox') as NodeListOf<HTMLInputElement>;
      mwCheckboxes.forEach((cb) => {
        cb.addEventListener('change', () => {
          const card = cb.closest('.cs-mw-checkbox-card');
          if (cb.checked) {
            card?.classList.add('selected');
          } else {
            card?.classList.remove('selected');
          }

          const selected: string[] = [];
          mwCheckboxes.forEach((c) => {
            if (c.checked) selected.push(c.value);
          });
          serviceState.middlewares = selected;
          updatePreview();
        });
      });
    } else {
      // Blueprint cards selection
      const bpCards = modal.querySelectorAll('[data-bp-type]');
      bpCards.forEach((card) => {
        card.addEventListener('click', () => {
          const type = card.getAttribute('data-bp-type') as MiddlewareRecipeType;
          if (type && type !== selectedBlueprintType) {
            selectedBlueprintType = type;
            const bp = MIDDLEWARE_BLUEPRINTS.find((b) => b.type === type);
            if (bp) {
              blueprintName = bp.defaultName;
              bp.fields.forEach((f) => {
                blueprintParams[f.key] = f.defaultValue;
              });
            }
            renderModal();
          }
        });
      });

      // Blueprint name input
      const bpNameInput = modal.querySelector('#cs-bp-name-input') as HTMLInputElement;
      bpNameInput?.addEventListener('input', () => {
        blueprintName = bpNameInput.value.trim().toLowerCase().replace(/[^a-z0-9\-]/g, '-');
        updatePreview();
      });

      // Dynamic blueprint fields
      const fieldInputs = modal.querySelectorAll('.cs-bp-field');
      fieldInputs.forEach((el) => {
        const key = el.getAttribute('data-field-key');
        if (!key) return;

        el.addEventListener('input', () => {
          if ((el as HTMLInputElement).type === 'checkbox') {
            blueprintParams[key] = (el as HTMLInputElement).checked;
          } else {
            blueprintParams[key] = (el as HTMLInputElement).value;
          }
          updatePreview();
        });
        el.addEventListener('change', () => {
          if ((el as HTMLInputElement).type === 'checkbox') {
            blueprintParams[key] = (el as HTMLInputElement).checked;
          } else {
            blueprintParams[key] = (el as HTMLInputElement).value;
          }
          updatePreview();
        });
      });
    }

    // Submit button
    const submitBtn = modal.querySelector('#cs-wizard-submit-btn') as HTMLButtonElement;
    submitBtn?.addEventListener('click', async () => {
      const cs = (window as any).ConfigStudio;

      if (currentMode === 'service') {
        if (!serviceState.name) {
          alert('Пожалуйста, укажите имя сервиса');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Создание...';

        const targetPath = getTargetServiceFilename(serviceState.rulesSubdir, serviceState.name);
        const yamlContent = generateServiceYaml(serviceState);

        try {
          if (cs?.createFile) {
            await cs.createFile(targetPath, yamlContent);
            await cs.refreshFiles?.();
            await indexer.scanWorkspace();
            cs.showNotification?.(`Сервис '${serviceState.name}' успешно создан в ${targetPath}`, 'success');
          } else {
            await fetch('/api/fs/file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-ConfigStudio-Web': '1' },
              body: JSON.stringify({ path: targetPath, content: yamlContent }),
            });
            await indexer.scanWorkspace();
            cs?.openFile?.(targetPath, { line: 1, highlight: true });
          }

          close();
          if (onCreated) onCreated(targetPath);
        } catch (err: any) {
          alert(`Ошибка при создании сервиса: ${err.message}`);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Создать ser-файл и открыть';
        }
      } else {
        // Blueprint creation
        if (!blueprintName) {
          alert('Пожалуйста, укажите имя middleware');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Создание...';

        const targetPath = getTargetMiddlewareFilename(serviceState.rulesSubdir, blueprintName);
        const yamlContent = generateMiddlewareYaml(selectedBlueprintType, blueprintName, blueprintParams);

        try {
          if (cs?.createFile) {
            await cs.createFile(targetPath, yamlContent);
            await cs.refreshFiles?.();
            await indexer.scanWorkspace();
            cs.showNotification?.(`Middleware '${blueprintName}' успешно создан в ${targetPath}`, 'success');
          } else {
            await fetch('/api/fs/file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-ConfigStudio-Web': '1' },
              body: JSON.stringify({ path: targetPath, content: yamlContent }),
            });
            await indexer.scanWorkspace();
            cs?.openFile?.(targetPath, { line: 1, highlight: true });
          }

          close();
          if (onCreated) onCreated(targetPath);
        } catch (err: any) {
          alert(`Ошибка при создании middleware: ${err.message}`);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Создать mw-файл и открыть';
        }
      }
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

  renderModal();
}

function getTargetServiceFilename(rulesDir?: string, name?: string): string {
  const dir = rulesDir ? rulesDir.replace(/[\\/]$/, '') : 'rules';
  const slug = (name || 'service').replace(/[^a-z0-9\-]/g, '-');
  return dir ? `${dir}/ser-${slug}.yml` : `ser-${slug}.yml`;
}

function getTargetMiddlewareFilename(rulesDir?: string, name?: string): string {
  const dir = rulesDir ? rulesDir.replace(/[\\/]$/, '') : 'rules';
  let slug = (name || 'middleware').replace(/[^a-z0-9\-]/g, '-');
  if (!slug.startsWith('mw-')) {
    slug = `mw-${slug}`;
  }
  return dir ? `${dir}/${slug}.yml` : `${slug}.yml`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
