import { generateServiceYaml } from '../generator';
import { TraefikWorkspaceIndexer } from '../indexer';
import { NewServiceConfig } from '../types';

export function openWizardModal(indexer: TraefikWorkspaceIndexer, onCreated?: (filePath: string) => void) {
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

  const state: NewServiceConfig = {
    name: 'myservice',
    host: 'myservice.example.com',
    targetUrl: 'http://127.0.0.1:8080',
    entryPoint: 'websecure',
    enableTls: true,
    certResolver: 'letsencrypt',
    middlewares: availableMiddlewares.length > 0 ? [`${availableMiddlewares[0].id}@file`] : [],
    rulesSubdir: rulesDir,
  };

  modal.innerHTML = `
    <div class="cs-traefik-header">
      <div class="cs-traefik-header-left">
        <div class="cs-traefik-icon-badge">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
          </svg>
        </div>
        <div>
          <h2 class="cs-traefik-title">Мастер нового сервиса Traefik</h2>
          <div class="cs-traefik-subtitle">Создание ser-&lt;имя&gt;.yml с автоматической привязкой middlewares и TLS</div>
        </div>
      </div>
      <button id="cs-wizard-close-btn" class="cs-traefik-btn-icon" title="Закрыть">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="cs-wizard-body">
      <!-- Left Column: Form -->
      <div class="cs-wizard-form">
        <div class="cs-form-group">
          <label class="cs-form-label">Имя сервиса (slug)</label>
          <input type="text" id="cs-wizard-name" class="cs-form-input" value="${state.name}" placeholder="jellyfin, vaultwarden, api..." />
          <div class="cs-form-hint">Будет создан файл: <code id="cs-wizard-target-filename">${getTargetFilename(state.rulesSubdir, state.name)}</code></div>
        </div>

        <div class="cs-form-group">
          <label class="cs-form-label">Домен / Host</label>
          <input type="text" id="cs-wizard-host" class="cs-form-input" value="${state.host}" placeholder="subdomain.domain.tld" />
        </div>

        <div class="cs-form-group">
          <label class="cs-form-label">Бэкенд URL (loadBalancer)</label>
          <input type="text" id="cs-wizard-url" class="cs-form-input" value="${state.targetUrl}" placeholder="http://192.168.1.50:8080" />
        </div>

        <div class="cs-form-row">
          <div class="cs-form-group cs-col-6">
            <label class="cs-form-label">EntryPoint</label>
            <select id="cs-wizard-entrypoint" class="cs-form-select">
              <option value="websecure" selected>websecure (443 / HTTPS)</option>
              <option value="web">web (80 / HTTP)</option>
              <option value="traefik">traefik (Dashboard)</option>
            </select>
          </div>
          <div class="cs-form-group cs-col-6">
            <label class="cs-form-label">Каталог правил</label>
            <input type="text" id="cs-wizard-rules-dir" class="cs-form-input" value="${state.rulesSubdir || 'rules'}" />
          </div>
        </div>

        <div class="cs-form-group cs-tls-box">
          <label class="cs-checkbox-label">
            <input type="checkbox" id="cs-wizard-tls" ${state.enableTls ? 'checked' : ''} />
            <span class="cs-checkbox-custom"></span>
            <span class="cs-checkbox-text">Включить автоматический TLS сертификат</span>
          </label>
          <div id="cs-wizard-tls-fields" style="${state.enableTls ? '' : 'display:none;'}margin-top:8px;">
            <label class="cs-form-label-sub">CertResolver</label>
            <input type="text" id="cs-wizard-cert-resolver" class="cs-form-input" value="${state.certResolver}" placeholder="letsencrypt" />
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
                <label class="cs-mw-checkbox-card ${state.middlewares.includes(`${mw.id}@file`) ? 'selected' : ''}">
                  <input type="checkbox" class="cs-mw-checkbox" value="${mw.id}@file" ${state.middlewares.includes(`${mw.id}@file`) ? 'checked' : ''} />
                  <div class="cs-mw-info">
                    <div class="cs-mw-name">${escapeHtml(mw.id)}</div>
                    <div class="cs-mw-type">${escapeHtml(mw.summary || mw.type)}</div>
                  </div>
                </label>
              `
                    )
                    .join('')
                : `<div class="cs-muted-box">Middlewares не найдены в workspace. Создайте их в mw-*.yml</div>`
            }
          </div>
        </div>
      </div>

      <!-- Right Column: Live YAML Preview -->
      <div class="cs-wizard-preview">
        <div class="cs-preview-header">
          <span class="cs-preview-title">Предпросмотр YAML</span>
          <span class="cs-preview-badge">Traefik Dynamic</span>
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
        Создать и открыть в редакторе
      </button>
    </div>
  `;

  function updatePreview() {
    const yaml = generateServiceYaml(state);
    const codeEl = modal.querySelector('#cs-wizard-preview-code');
    if (codeEl) codeEl.textContent = yaml;

    const fileEl = modal.querySelector('#cs-wizard-target-filename');
    if (fileEl) fileEl.textContent = getTargetFilename(state.rulesSubdir, state.name);
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

    const nameInput = modal.querySelector('#cs-wizard-name') as HTMLInputElement;
    nameInput?.addEventListener('input', () => {
      state.name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9\-]/g, '-');
      updatePreview();
    });

    const hostInput = modal.querySelector('#cs-wizard-host') as HTMLInputElement;
    hostInput?.addEventListener('input', () => {
      state.host = hostInput.value.trim();
      updatePreview();
    });

    const urlInput = modal.querySelector('#cs-wizard-url') as HTMLInputElement;
    urlInput?.addEventListener('input', () => {
      state.targetUrl = urlInput.value.trim();
      updatePreview();
    });

    const epSelect = modal.querySelector('#cs-wizard-entrypoint') as HTMLSelectElement;
    epSelect?.addEventListener('change', () => {
      state.entryPoint = epSelect.value;
      updatePreview();
    });

    const rulesDirInput = modal.querySelector('#cs-wizard-rules-dir') as HTMLInputElement;
    rulesDirInput?.addEventListener('input', () => {
      state.rulesSubdir = rulesDirInput.value.trim();
      updatePreview();
    });

    const tlsCheckbox = modal.querySelector('#cs-wizard-tls') as HTMLInputElement;
    const tlsFields = modal.querySelector('#cs-wizard-tls-fields') as HTMLElement;
    tlsCheckbox?.addEventListener('change', () => {
      state.enableTls = tlsCheckbox.checked;
      if (tlsFields) tlsFields.style.display = state.enableTls ? '' : 'none';
      updatePreview();
    });

    const certInput = modal.querySelector('#cs-wizard-cert-resolver') as HTMLInputElement;
    certInput?.addEventListener('input', () => {
      state.certResolver = certInput.value.trim();
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
        state.middlewares = selected;
        updatePreview();
      });
    });

    // Submit button
    const submitBtn = modal.querySelector('#cs-wizard-submit-btn') as HTMLButtonElement;
    submitBtn?.addEventListener('click', async () => {
      if (!state.name) {
        alert('Пожалуйста, укажите имя сервиса');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Создание...';

      const targetPath = getTargetFilename(state.rulesSubdir, state.name);
      const yamlContent = generateServiceYaml(state);

      try {
        const cs = (window as any).ConfigStudio;
        if (cs?.createFile) {
          await cs.createFile(targetPath, yamlContent);
          await cs.refreshFiles?.();
          await indexer.scanWorkspace();
          await cs.openFile(targetPath, { line: 1, highlight: true });
          cs.showNotification?.(`Сервис '${state.name}' успешно создан в ${targetPath}`, 'success');
        } else {
          // Fallback via REST API /api/fs/create & /api/fs/file
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
        submitBtn.textContent = 'Создать и открыть в редакторе';
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

  updatePreview();
  bindEvents();
}

function getTargetFilename(rulesDir?: string, name?: string): string {
  const dir = rulesDir ? rulesDir.replace(/[\\/]$/, '') : 'rules';
  const slug = (name || 'service').replace(/[^a-z0-9\-]/g, '-');
  return dir ? `${dir}/ser-${slug}.yml` : `ser-${slug}.yml`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
