import { FsProvider, TraefikWorkspaceIndexer } from './indexer';
import { setupMonacoTraefik } from './monacoProvider';
import { createTraefikOutlineProvider } from './outlineProvider';
import { openMatrixModal } from './ui/matrixModal';
import { openWizardModal } from './ui/wizardModal';

class StudioFsProvider implements FsProvider {
  async listFiles(): Promise<string[]> {
    try {
      // 1. First try listing root tree
      const res = await fetch('/api/fs/tree', {
        headers: { 'X-ConfigStudio-Web': '1' },
      });
      if (res.ok) {
        const data = await res.json();
        const results: string[] = [];
        const walk = (items: any[]) => {
          if (!Array.isArray(items)) return;
          for (const item of items) {
            if (item.isDir && item.children) {
              walk(item.children);
            } else if (!item.isDir && item.path) {
              const lower = item.path.toLowerCase();
              if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
                results.push(item.path);
              }
            }
          }
        };
        walk(data.items || data || []);
        if (results.length > 0) return results;
      }
    } catch (_) {}

    try {
      // 2. Fallback: Search for YAML files
      const searchRes = await fetch('/api/fs/search?q=.yml', {
        headers: { 'X-ConfigStudio-Web': '1' },
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        return (data.items || []).map((i: any) => i.path || i.name);
      }
    } catch (_) {}

    return [];
  }

  async readFile(path: string): Promise<string> {
    try {
      const res = await fetch(`/api/fs/file?path=${encodeURIComponent(path)}`, {
        headers: { 'X-ConfigStudio-Web': '1' },
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.content || '';
    } catch (_) {
      return '';
    }
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
