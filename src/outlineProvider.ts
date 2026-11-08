import { parseTraefikYaml } from './parser';

export interface OutlineNode {
  id: string;
  name: string;
  kind: 'object' | 'list' | 'string' | 'number' | 'boolean' | 'section' | 'function' | 'class';
  line: number;
  column?: number;
  children?: OutlineNode[];
}

export function createTraefikOutlineProvider() {
  return {
    language: 'yaml',
    parse: (content: string, filename: string): OutlineNode[] => {
      const lower = filename.toLowerCase();
      // Only handle Traefik files
      const isTraefik =
        lower.includes('traefik') ||
        lower.includes('/rules/') ||
        lower.includes('\\rules\\') ||
        lower.split(/[\\/]/).pop()?.startsWith('mw-') ||
        lower.split(/[\\/]/).pop()?.startsWith('ser-');

      if (!isTraefik && !content.includes('http:')) {
        return [];
      }

      const parsed = parseTraefikYaml(content, filename);
      const rootNodes: OutlineNode[] = [];

      // 1. Routers
      if (parsed.routers.length > 0) {
        rootNodes.push({
          id: 'section_routers',
          name: `🌐 Маршрутизаторы (${parsed.routers.length})`,
          kind: 'section',
          line: parsed.routers[0].line > 1 ? parsed.routers[0].line - 1 : 1,
          children: parsed.routers.map((r) => ({
            id: `router_${r.id}`,
            name: `${r.id} ${r.host ? `[${r.host}]` : ''}`,
            kind: 'function',
            line: r.line,
            children: [
              ...(r.middlewares.map((mw) => ({
                id: `router_${r.id}_mw_${mw}`,
                name: `🛡️ ${mw}`,
                kind: 'string' as const,
                line: r.middlewareLines?.[mw] || r.line,
              }))),
              ...(r.service ? [{
                id: `router_${r.id}_svc_${r.service}`,
                name: `⚙️ ${r.service}`,
                kind: 'string' as const,
                line: r.serviceLine || r.line,
              }] : []),
            ],
          })),
        });
      }

      // 2. Services
      if (parsed.services.length > 0) {
        rootNodes.push({
          id: 'section_services',
          name: `⚙️ Сервисы (${parsed.services.length})`,
          kind: 'section',
          line: parsed.services[0].line > 1 ? parsed.services[0].line - 1 : 1,
          children: parsed.services.map((s) => ({
            id: `svc_${s.id}`,
            name: `${s.id} ${s.servers.length > 0 ? `(${s.servers[0]})` : ''}`,
            kind: 'class',
            line: s.line,
          })),
        });
      }

      // 3. Middlewares
      if (parsed.middlewares.length > 0) {
        rootNodes.push({
          id: 'section_middlewares',
          name: `🛡️ Middlewares (${parsed.middlewares.length})`,
          kind: 'section',
          line: parsed.middlewares[0].line > 1 ? parsed.middlewares[0].line - 1 : 1,
          children: parsed.middlewares.map((m) => ({
            id: `mw_${m.id}`,
            name: `${m.id} [${m.summary || m.type}]`,
            kind: 'object',
            line: m.line,
          })),
        });
      }

      return rootNodes;
    },
  };
}
