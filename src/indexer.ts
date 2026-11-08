import { lintTraefikIndex } from './linter';
import { parseTraefikYaml } from './parser';
import {
  LinterIssue,
  TraefikIndex,
  TraefikMiddleware,
  TraefikRouter,
  TraefikService,
} from './types';

export interface FsProvider {
  listFiles(): Promise<string[]>;
  readFile(path: string): Promise<string>;
}

export class TraefikWorkspaceIndexer {
  private fs: FsProvider;
  private currentIndex: TraefikIndex | null = null;
  private isScanning = false;

  constructor(fs: FsProvider) {
    this.fs = fs;
  }

  public getIndex(): TraefikIndex | null {
    return this.currentIndex;
  }

  public async scanWorkspace(): Promise<TraefikIndex> {
    if (this.isScanning) {
      return (
        this.currentIndex || {
          middlewares: new Map(),
          services: new Map(),
          routers: new Map(),
          files: [],
          issues: [],
          lastScanTime: Date.now(),
        }
      );
    }

    this.isScanning = true;
    try {
      const allFiles = await this.fs.listFiles();
      // Filter for Traefik-relevant YAML files
      const traefikFiles = allFiles.filter((f) => {
        const lower = f.toLowerCase();
        if (!lower.endsWith('.yml') && !lower.endsWith('.yaml')) return false;
        const name = lower.split(/[\\/]/).pop() || '';
        return (
          name.startsWith('mw-') ||
          name.startsWith('ser-') ||
          name.startsWith('traefik') ||
          name === 'config.yml' ||
          name === 'config.yaml' ||
          lower.startsWith('rules/') ||
          lower.startsWith('rules\\') ||
          lower.includes('/rules/') ||
          lower.includes('\\rules\\') ||
          lower.startsWith('conf.d/') ||
          lower.startsWith('conf.d\\') ||
          lower.includes('/conf.d/') ||
          lower.includes('\\conf.d\\')
        );
      });

      const middlewares = new Map<string, TraefikMiddleware>();
      const services = new Map<string, TraefikService>();
      const routers = new Map<string, TraefikRouter>();

      // Detect rules directory (e.g. `rules` or `/etc/traefik/rules`)
      let detectedRulesDir: string | undefined;
      for (const f of allFiles) {
        const lower = f.toLowerCase();
        if (lower.startsWith('rules/') || lower.startsWith('rules\\') || lower === 'rules') {
          detectedRulesDir = 'rules';
          break;
        }
        if (lower.includes('/rules/') || lower.includes('\\rules\\')) {
          const idx = lower.lastIndexOf('rules');
          detectedRulesDir = f.substring(0, idx + 5);
          break;
        }
      }
      if (!detectedRulesDir) {
        for (const f of allFiles) {
          const lower = f.toLowerCase();
          if (lower.startsWith('conf.d/') || lower.startsWith('conf.d\\')) {
            detectedRulesDir = 'conf.d';
            break;
          }
        }
      }
      if (!detectedRulesDir) {
        detectedRulesDir = 'rules';
      }

      const validTraefikFiles: string[] = [];

      for (const filePath of traefikFiles) {
        try {
          const content = await this.fs.readFile(filePath);
          if (!content) continue;

          const parsed = parseTraefikYaml(content, filePath);
          const hasEntities =
            parsed.middlewares.length > 0 ||
            parsed.services.length > 0 ||
            parsed.routers.length > 0;

          const lower = filePath.toLowerCase();
          const inRulesFolder =
            lower.startsWith('rules/') ||
            lower.startsWith('rules\\') ||
            lower.includes('/rules/') ||
            lower.includes('\\rules\\') ||
            lower.startsWith('conf.d/') ||
            lower.startsWith('conf.d\\') ||
            lower.includes('/conf.d/') ||
            lower.includes('\\conf.d\\');

          // Only keep files that define Traefik entities or are inside rules directories
          if (hasEntities || inRulesFolder) {
            validTraefikFiles.push(filePath);
          }

          parsed.middlewares.forEach((m) => {
            middlewares.set(m.id, m);
          });

          parsed.services.forEach((s) => {
            services.set(s.id, s);
          });

          parsed.routers.forEach((r) => {
            routers.set(r.id, r);
          });
        } catch (err) {
          console.warn(`[TraefikIndexer] Failed to parse ${filePath}:`, err);
        }
      }

      const index: TraefikIndex = {
        middlewares,
        services,
        routers,
        files: validTraefikFiles,
        rulesDir: detectedRulesDir,
        issues: [],
        lastScanTime: Date.now(),
      };

      // Run Linter on the unified index
      index.issues = lintTraefikIndex(index);
      this.currentIndex = index;
      return index;
    } finally {
      this.isScanning = false;
    }
  }

  public findDefinition(reference: string): { file: string; line: number; type: 'middleware' | 'service' } | null {
    if (!this.currentIndex || !reference) return null;

    const cleanRef = reference.replace(/@file$/, '').trim();

    // Check if it's a middleware (exact, with mw- prefix, or without mw- prefix)
    if (this.currentIndex.middlewares.has(cleanRef)) {
      const mw = this.currentIndex.middlewares.get(cleanRef)!;
      return { file: mw.file, line: mw.line, type: 'middleware' };
    }
    if (this.currentIndex.middlewares.has(`mw-${cleanRef}`)) {
      const mw = this.currentIndex.middlewares.get(`mw-${cleanRef}`)!;
      return { file: mw.file, line: mw.line, type: 'middleware' };
    }
    if (cleanRef.startsWith('mw-') && this.currentIndex.middlewares.has(cleanRef.substring(3))) {
      const mw = this.currentIndex.middlewares.get(cleanRef.substring(3))!;
      return { file: mw.file, line: mw.line, type: 'middleware' };
    }

    // Check if it's a service (exact, with -svc or -service suffix)
    if (this.currentIndex.services.has(cleanRef)) {
      const svc = this.currentIndex.services.get(cleanRef)!;
      return { file: svc.file, line: svc.line, type: 'service' };
    }
    if (this.currentIndex.services.has(`${cleanRef}-svc`)) {
      const svc = this.currentIndex.services.get(`${cleanRef}-svc`)!;
      return { file: svc.file, line: svc.line, type: 'service' };
    }
    if (this.currentIndex.services.has(`${cleanRef}-service`)) {
      const svc = this.currentIndex.services.get(`${cleanRef}-service`)!;
      return { file: svc.file, line: svc.line, type: 'service' };
    }
    if (cleanRef.endsWith('-svc') && this.currentIndex.services.has(cleanRef.replace(/-svc$/, ''))) {
      const svc = this.currentIndex.services.get(cleanRef.replace(/-svc$/, ''))!;
      return { file: svc.file, line: svc.line, type: 'service' };
    }
    if (cleanRef.endsWith('-service') && this.currentIndex.services.has(cleanRef.replace(/-service$/, ''))) {
      const svc = this.currentIndex.services.get(cleanRef.replace(/-service$/, ''))!;
      return { file: svc.file, line: svc.line, type: 'service' };
    }

    return null;
  }
}
