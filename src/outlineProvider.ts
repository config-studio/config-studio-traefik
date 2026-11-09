import { parseTraefikYaml } from './parser';

export interface OutlineNode {
  id: string;
  label: string;
  name: string;
  type:
    | 'object'
    | 'list'
    | 'string'
    | 'number'
    | 'boolean'
    | 'section'
    | 'router'
    | 'service'
    | 'middleware'
    | 'function'
    | 'class';
  kind:
    | 'object'
    | 'list'
    | 'string'
    | 'number'
    | 'boolean'
    | 'section'
    | 'router'
    | 'service'
    | 'middleware'
    | 'function'
    | 'class';
  line: number;
  column?: number;
  children?: OutlineNode[];
}

export function createTraefikOutlineProvider() {
  return {
    language: 'yaml',
    parse: (content: string, filename: string): OutlineNode[] => {
      const lower = (filename || '').toLowerCase().replace(/\\/g, '/');
      const baseName = lower.split('/').pop() || '';

      // Check if file is a candidate for Traefik dynamic configuration
      const isTraefikCandidate =
        lower.includes('traefik') ||
        lower.includes('/rules/') ||
        lower.startsWith('rules/') ||
        baseName.startsWith('mw-') ||
        baseName.startsWith('ser-') ||
        content.includes('routers:') ||
        content.includes('middlewares:') ||
        (content.includes('http:') && (content.includes('services:') || content.includes('middlewares:')));

      if (!isTraefikCandidate) {
        return [];
      }

      const parsed = parseTraefikYaml(content, filename);

      // If no Traefik constructs were detected, fall back to generic YAML parser
      if (
        parsed.routers.length === 0 &&
        parsed.services.length === 0 &&
        parsed.middlewares.length === 0
      ) {
        return [];
      }

      const rootNodes: OutlineNode[] = [];

      // 1. Routers
      if (parsed.routers.length > 0) {
        const title = `🌐 Маршрутизаторы (${parsed.routers.length})`;
        const line =
          parsed.sectionLines?.routers ||
          (parsed.routers[0].line > 1 ? parsed.routers[0].line - 1 : 1);

        rootNodes.push({
          id: 'section_routers',
          label: title,
          name: title,
          type: 'section',
          kind: 'section',
          line,
          children: parsed.routers.map((r) => {
            const rTitle = `${r.id} ${r.host ? `[${r.host}]` : ''}`.trim();
            const childNodes: OutlineNode[] = [];

            // Nested Middlewares
            for (const mw of r.middlewares) {
              const mwTitle = `🛡️ ${mw}`;
              childNodes.push({
                id: `router_${r.id}_mw_${mw}`,
                label: mwTitle,
                name: mwTitle,
                type: 'middleware',
                kind: 'middleware',
                line: r.middlewareLines?.[mw] || r.line,
              });
            }

            // Nested Service reference
            if (r.service) {
              const svcTitle = `⚙️ ${r.service}`;
              childNodes.push({
                id: `router_${r.id}_svc_${r.service}`,
                label: svcTitle,
                name: svcTitle,
                type: 'service',
                kind: 'service',
                line: r.serviceLine || r.line,
              });
            }

            return {
              id: `router_${r.id}`,
              label: rTitle,
              name: rTitle,
              type: 'router',
              kind: 'router',
              line: r.line,
              children: childNodes.length > 0 ? childNodes : undefined,
            };
          }),
        });
      }

      // 2. Services
      if (parsed.services.length > 0) {
        const title = `⚙️ Сервисы (${parsed.services.length})`;
        const line =
          parsed.sectionLines?.services ||
          (parsed.services[0].line > 1 ? parsed.services[0].line - 1 : 1);

        rootNodes.push({
          id: 'section_services',
          label: title,
          name: title,
          type: 'section',
          kind: 'section',
          line,
          children: parsed.services.map((s) => {
            const serverInfo = s.servers.length > 0 ? `(${s.servers[0]})` : '';
            const sTitle = `${s.id} ${serverInfo}`.trim();
            return {
              id: `svc_${s.id}`,
              label: sTitle,
              name: sTitle,
              type: 'service',
              kind: 'service',
              line: s.line,
            };
          }),
        });
      }

      // 3. Middlewares
      if (parsed.middlewares.length > 0) {
        const title = `🛡️ Middlewares (${parsed.middlewares.length})`;
        const line =
          parsed.sectionLines?.middlewares ||
          (parsed.middlewares[0].line > 1 ? parsed.middlewares[0].line - 1 : 1);

        rootNodes.push({
          id: 'section_middlewares',
          label: title,
          name: title,
          type: 'section',
          kind: 'section',
          line,
          children: parsed.middlewares.map((m) => {
            const desc = m.summary || m.type;
            const mTitle = `${m.id} [${desc}]`;
            return {
              id: `mw_${m.id}`,
              label: mTitle,
              name: mTitle,
              type: 'middleware',
              kind: 'middleware',
              line: m.line,
            };
          }),
        });
      }

      return rootNodes;
    },
  };
}
