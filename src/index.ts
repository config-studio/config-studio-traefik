import { FsProvider, TraefikWorkspaceIndexer } from './indexer';
import { extractTokenAtPosition, setupMonacoTraefik } from './monacoProvider';
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

  // Update Monaco Editor Markers (Red/Yellow squigglies for Linter issues)
  function updateEditorMarkers(editor: any, monacoInstance: any) {
    if (!editor || !monacoInstance) return;
    const model = editor.getModel?.();
    if (!model) return;
    const activeFile = cs.getActiveFile?.();
    const filePath = (activeFile?.path || activeFile?.name || '').replace(/\\/g, '/');
    if (!filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) {
      monacoInstance.editor?.setModelMarkers?.(model, 'traefik', []);
      return;
    }

    const index = indexer.getIndex();
    if (!index || !index.issues) return;

    const markers: any[] = [];
    const fileName = filePath.split('/').pop() || '';

    // Find issues for the current file
    const fileIssues = index.issues.filter((issue) => {
      const issueFile = issue.file.replace(/\\/g, '/');
      const issueBase = issueFile.split('/').pop() || '';
      return issueFile === filePath || issueFile.endsWith(filePath) || filePath.endsWith(issueFile) || issueBase === fileName;
    });

    fileIssues.forEach((issue) => {
      const line = Math.max(1, Math.min(issue.line, model.getLineCount()));
      const lineContent = model.getLineContent(line);
      const firstNonWs = lineContent.search(/\S/);
      const startCol = firstNonWs >= 0 ? firstNonWs + 1 : 1;
      const endCol = Math.max(startCol + 1, lineContent.length + 1);

      markers.push({
        severity:
          issue.severity === 'error'
            ? monacoInstance.MarkerSeverity?.Error ?? 8
            : monacoInstance.MarkerSeverity?.Warning ?? 4,
        code: issue.code,
        message: `[Traefik Linter] ${issue.code}: ${issue.message}`,
        startLineNumber: line,
        startColumn: startCol,
        endLineNumber: line,
        endColumn: endCol,
      });
    });

    monacoInstance.editor?.setModelMarkers?.(model, 'traefik', markers);
  }

  // Initial Scan
  indexer.scanWorkspace().then((index) => {
    console.log(
      `[TraefikPlugin] Indexed ${index.routers.size} routers, ${index.middlewares.size} middlewares, ${index.services.size} services, ${index.issues.length} issues.`
    );
    const ed = cs.getEditor?.();
    const m = cs.getMonaco?.();
    if (ed && m) updateEditorMarkers(ed, m);
  });

  // Re-scan when files are saved
  cs.onFileSave?.((file: any) => {
    const ext = (file?.name || file?.path || '').toLowerCase();
    if (ext.endsWith('.yml') || ext.endsWith('.yaml')) {
      indexer.scanWorkspace().then(() => {
        const ed = cs.getEditor?.();
        const m = cs.getMonaco?.();
        if (ed && m) updateEditorMarkers(ed, m);
      });
    }
  });

  // Re-check markers when new file is opened
  cs.onFileOpen?.((file: any) => {
    const ext = (file?.name || file?.path || '').toLowerCase();
    if (ext.endsWith('.yml') || ext.endsWith('.yaml')) {
      setTimeout(() => {
        const ed = cs.getEditor?.();
        const m = cs.getMonaco?.();
        if (ed && m) updateEditorMarkers(ed, m);
      }, 150);
    }
  });

  // Register Monaco Outline Provider for both yaml and yml
  const outlineProvider = createTraefikOutlineProvider();
  cs.registerOutlineProvider?.(outlineProvider);
  cs.registerOutlineProvider?.({
    ...outlineProvider,
    language: 'yml',
  });

  function hookEditorInstance(editor: any, monacoInstance: any) {
    if (!editor || (editor as any).__cs_traefik_hooked) return;
    (editor as any).__cs_traefik_hooked = true;

    editor.onDidChangeModel?.(() => {
      updateEditorMarkers(editor, monacoInstance);
    });

    // Double-click or Ctrl/Cmd-click on any middleware or service -> instant jump!
    editor.onMouseDown?.((e: any) => {
      if (e.event?.detail === 2 || e.event?.ctrlKey || e.event?.metaKey) {
        const pos = e.target?.position;
        if (!pos) return;
        const model = editor.getModel?.();
        if (!model) return;
        const line = model.getLineContent(pos.lineNumber);
        const token = extractTokenAtPosition(line, pos.column);
        if (!token) return;

        const def = indexer.findDefinition(token.cleanRef) || indexer.findDefinition(token.rawToken);
        if (def && cs.openFile) {
          e.event?.preventDefault?.();
          cs.openFile(def.file, { line: def.line, highlight: true });
          cs.showNotification?.(`Переход к определению ${token.cleanRef} (${def.file}:${def.line})`, 'info');
        }
      }
    });

    // Right-Click Context Menu Action: "Traefik: Перейти к определению"
    editor.addAction?.({
      id: 'cs-traefik-goto-definition',
      label: 'Traefik: Перейти к определению',
      keybindings: monacoInstance?.KeyMod?.CtrlCmd ? [monacoInstance.KeyMod.CtrlCmd | 123, 123] : [123],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: (ed: any) => {
        const pos = ed.getPosition?.();
        if (!pos) return;
        const model = ed.getModel?.();
        if (!model) return;
        const line = model.getLineContent(pos.lineNumber);
        const token = extractTokenAtPosition(line, pos.column);
        if (!token) return;

        const def = indexer.findDefinition(token.cleanRef) || indexer.findDefinition(token.rawToken);
        if (def && cs.openFile) {
          cs.openFile(def.file, { line: def.line, highlight: true });
          cs.showNotification?.(`Переход к ${token.cleanRef} в ${def.file}:${def.line}`, 'info');
        } else {
          cs.showNotification?.(`Определение для '${token.cleanRef}' не найдено`, 'error');
        }
      },
    });
  }

  // Register Monaco Autocomplete & Go to Definition
  const monaco = cs.getMonaco?.();
  if (monaco) {
    setupMonacoTraefik(monaco, indexer);
    const initialEditor = cs.getEditor?.();
    if (initialEditor) hookEditorInstance(initialEditor, monaco);
  } else {
    // If Monaco loads lazily
    const checkMonaco = setInterval(() => {
      const m = cs.getMonaco?.();
      if (m) {
        setupMonacoTraefik(m, indexer);
        const ed = cs.getEditor?.();
        if (ed) hookEditorInstance(ed, m);
        clearInterval(checkMonaco);
      }
    }, 500);
    setTimeout(() => clearInterval(checkMonaco), 10000);
  }

  // Periodically ensure current active editor instance has jump handlers and up-to-date markers
  setInterval(() => {
    const ed = cs.getEditor?.();
    const m = cs.getMonaco?.();
    if (ed) {
      hookEditorInstance(ed, m);
      updateEditorMarkers(ed, m);
    }
  }, 2000);

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
