import { FsProvider, TraefikWorkspaceIndexer } from './indexer';
import { setupMonacoTraefik } from './monacoProvider';
import { createTraefikOutlineProvider } from './outlineProvider';
import { openMatrixModal } from './ui/matrixModal';
import { openWizardModal } from './ui/wizardModal';

class StudioFsProvider implements FsProvider {
  async listFiles(): Promise<string[]> {
    const fileSet = new Set<string>();

    // 1. Recursive Tree Walk (max depth 4, ignores system/build folders)
    try {
      const visited = new Set<string>();
      const scanDir = async (dirPath: string, depth = 0) => {
        if (depth > 4 || visited.has(dirPath)) return;
        visited.add(dirPath);

        const url = dirPath
          ? `/api/fs/tree?path=${encodeURIComponent(dirPath)}`
          : '/api/fs/tree';
        const res = await fetch(url, {
          headers: { 'X-ConfigStudio-Web': '1' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const items = data.items || [];
        for (const item of items) {
          if (item.isDir) {
            const name = (item.name || '').toLowerCase();
            if (
              name.startsWith('.') ||
              name === 'node_modules' ||
              name === 'bin' ||
              name === 'dist' ||
              name === 'data' ||
              name === 'tmp' ||
              name === 'coverage'
            ) {
              continue;
            }
            await scanDir(item.path || `${dirPath ? dirPath + '/' : ''}${item.name}`, depth + 1);
          } else if (item.path) {
            const lower = item.path.toLowerCase();
            if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
              fileSet.add(item.path.replace(/\\/g, '/'));
            }
          }
        }
      };

      await scanDir('');
    } catch (e) {
      console.warn('[TraefikPlugin] Tree walk error:', e);
    }

    // 2. Also search backend to guarantee no files are missed
    try {
      const searchRes = await fetch('/api/fs/search?q=.yml', {
        headers: { 'X-ConfigStudio-Web': '1' },
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        for (const item of data.items || []) {
          const p = (item.path || item.name || '').replace(/\\/g, '/');
          const lower = p.toLowerCase();
          if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
            fileSet.add(p);
          }
        }
      }
    } catch (_) {}

    return Array.from(fileSet);
  }

  async readFile(path: string): Promise<string> {
    const normPath = path.replace(/\\/g, '/');
    try {
      const res = await fetch(`/api/fs/file?path=${encodeURIComponent(normPath)}`, {
        headers: { 'X-ConfigStudio-Web': '1' },
      });
      if (res.ok) {
        const data = await res.json();
        return data.content || '';
      }
    } catch (_) {}

    // Fallback: if path has root prefix (e.g. "root:rules/foo.yml"), try stripped path
    if (normPath.includes(':')) {
      try {
        const stripped = normPath.split(':').pop() || normPath;
        const res = await fetch(`/api/fs/file?path=${encodeURIComponent(stripped)}`, {
          headers: { 'X-ConfigStudio-Web': '1' },
        });
        if (res.ok) {
          const data = await res.json();
          return data.content || '';
        }
      } catch (_) {}
    }

    return '';
  }
}

// Plugin Initialization
(function initTraefikPlugin() {
  const cs = (window as any).ConfigStudio;
  if (!cs) {
    console.warn('[TraefikPlugin] ConfigStudio global API not found.');
    return;
  }

  const fs = new StudioFsProvider();
  const indexer = new TraefikWorkspaceIndexer(fs);

  // Initial Scan
  indexer.scanWorkspace().then((index) => {
    console.log(
      `[TraefikPlugin] Indexed ${index.routers.size} routers, ${index.middlewares.size} middlewares, ${index.services.size} services.`
    );
  });

  // Re-scan when files are saved
  cs.onFileSave?.((file: any) => {
    const ext = (file?.name || file?.path || '').toLowerCase();
    if (ext.endsWith('.yml') || ext.endsWith('.yaml')) {
      indexer.scanWorkspace();
    }
  });

  // Register Monaco Outline Provider
  cs.registerOutlineProvider?.(createTraefikOutlineProvider());

  // Register Monaco Autocomplete & Go to Definition
  const monaco = cs.getMonaco?.();
  if (monaco) {
    setupMonacoTraefik(monaco, indexer);
  } else {
    // If Monaco loads lazily
    const checkMonaco = setInterval(() => {
      const m = cs.getMonaco?.();
      if (m) {
        setupMonacoTraefik(m, indexer);
        clearInterval(checkMonaco);
      }
    }, 500);
    setTimeout(() => clearInterval(checkMonaco), 10000);
  }

  // Register Toolbar Button
  cs.registerToolbarButton?.({
    id: 'cs-btn-traefik-matrix',
    pluginId: 'traefik',
    label: 'Traefik Matrix',
    title: 'Открыть Матрицу правил и сервисов Traefik',
    icon: 'network',
    onClick: () => {
      openMatrixModal(indexer, () => openWizardModal(indexer));
    },
  });

  // Register Context Menu
  cs.registerContextMenu?.({
    id: 'cs-ctx-traefik-matrix',
    label: 'Traefik: Матрица правил',
    icon: 'network',
    group: 'tools',
    order: 40,
    fileMatches: ['.yml', '.yaml'],
    targetType: 'any',
    onClick: () => {
      openMatrixModal(indexer, () => openWizardModal(indexer));
    },
  });

  cs.registerContextMenu?.({
    id: 'cs-ctx-traefik-wizard',
    label: 'Traefik: Новый сервис (Wizard)',
    icon: 'plus',
    group: 'edit',
    order: 41,
    fileMatches: ['.yml', '.yaml'],
    targetType: 'any',
    onClick: () => {
      openWizardModal(indexer);
    },
  });

  // Register Inter-Plugin Service
  if (cs.services?.register) {
    cs.services.register(
      'traefik-manager',
      {
        getIndex: () => indexer.getIndex(),
        scanWorkspace: () => indexer.scanWorkspace(),
        findDefinition: (ref: string) => indexer.findDefinition(ref),
        openMatrix: () => openMatrixModal(indexer, () => openWizardModal(indexer)),
        openWizard: () => openWizardModal(indexer),
      },
      'traefik'
    );
  }

  console.log('[TraefikPlugin] Traefik Dynamic Configuration Plugin initialized successfully.');
})();
