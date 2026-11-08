import { TraefikMiddleware, TraefikRouter, TraefikService } from './types';

export interface ParseResult {
  middlewares: TraefikMiddleware[];
  routers: TraefikRouter[];
  services: TraefikService[];
}

export function parseTraefikYaml(yamlContent: string, filePath: string): ParseResult {
  const middlewares: TraefikMiddleware[] = [];
  const routers: TraefikRouter[] = [];
  const services: TraefikService[] = [];

  const lines = yamlContent.split(/\r?\n/);

  let currentSection: 'routers' | 'services' | 'middlewares' | null = null;
  let currentItem: any = null;
  let currentProperty: string | null = null;
  let sectionIndent = -1;
  let itemIndent = -1;

  function finalizeCurrentItem() {
    if (!currentItem) return;

    if (currentSection === 'routers') {
      const router: TraefikRouter = {
        id: currentItem.id,
        file: filePath,
        line: currentItem.line,
        rule: currentItem.rule || '',
        host: extractHostFromRule(currentItem.rule || ''),
        entryPoints: currentItem.entryPoints || [],
        service: currentItem.service || currentItem.id,
        serviceLine: currentItem.serviceLine,
        middlewares: currentItem.middlewares || [],
        middlewareLines: currentItem.middlewareLines || {},
        tls: Boolean(currentItem.tls),
        certResolver: currentItem.certResolver,
        priority: currentItem.priority,
      };
      routers.push(router);
    } else if (currentSection === 'services') {
      const service: TraefikService = {
        id: currentItem.id,
        file: filePath,
        line: currentItem.line,
        type: currentItem.type || 'loadBalancer',
        servers: currentItem.servers || [],
        passHostHeader: currentItem.passHostHeader,
      };
      services.push(service);
    } else if (currentSection === 'middlewares') {
      const middleware: TraefikMiddleware = {
        id: currentItem.id,
        name: currentItem.id,
        file: filePath,
        line: currentItem.line,
        type: currentItem.type || 'custom',
        summary: currentItem.summary || buildMiddlewareSummary(currentItem.type, currentItem.raw),
        rawConfig: currentItem.raw,
      };
      middlewares.push(middleware);
    }

    currentItem = null;
    currentProperty = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = i + 1;

    // Skip empty lines or full comments
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Measure leading whitespace indentation
    const indent = rawLine.search(/\S/);

    // Check for section headers under http: (routers:, services:, middlewares:)
    // A section header must have indent <= sectionIndent (if already in a section)
    // or itemIndent === -1.
    const isSectionHeaderCandidate =
      trimmed === 'routers:' ||
      trimmed === 'services:' ||
      trimmed === 'middlewares:' ||
      trimmed.match(/^(routers|services|middlewares)\s*:\s*$/);

    if (isSectionHeaderCandidate && (itemIndent === -1 || indent < itemIndent)) {
      finalizeCurrentItem();
      const match = trimmed.match(/^(routers|services|middlewares)/);
      currentSection = match ? (match[1] as any) : null;
      sectionIndent = indent;
      itemIndent = -1;
      continue;
    }

    // Check if we exited the current section by encountering an equal or lower indented key
    if (currentSection && sectionIndent !== -1 && indent <= sectionIndent && trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      finalizeCurrentItem();
      currentSection = null;
      sectionIndent = -1;
      itemIndent = -1;
      continue;
    }

    if (!currentSection) continue;

    // Check for item definition (e.g. `jellyfin-secure:` or `mw-local-only:`)
    // An item definition must have indent > sectionIndent and (itemIndent === -1 or indent <= itemIndent)
    const isItemHeaderCandidate = trimmed.match(/^([a-zA-Z0-9_\-\.]+)\s*:\s*$/);
    if (
      isItemHeaderCandidate &&
      indent > sectionIndent &&
      (itemIndent === -1 || indent <= itemIndent)
    ) {
      finalizeCurrentItem();
      itemIndent = indent;
      currentItem = {
        id: isItemHeaderCandidate[1],
        line: lineNumber,
      };
      currentProperty = null;
      continue;
    }

    if (!currentItem) continue;

    // Property processing inside currentItem (indent must be > itemIndent)
    if (indent > itemIndent) {
      // Check for property key: e.g. `rule: "..."`, `middlewares:`, `loadBalancer:`
      const propMatch = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.*)$/);

      if (propMatch && !trimmed.startsWith('-')) {
        const key = propMatch[1];
        const val = propMatch[2].trim();
        currentProperty = key;

        if (currentSection === 'routers') {
          if (key === 'rule') {
            currentItem.rule = cleanQuote(val);
          } else if (key === 'service') {
            currentItem.service = cleanQuote(val);
            currentItem.serviceLine = lineNumber;
          } else if (key === 'priority') {
            currentItem.priority = parseInt(val, 10);
          } else if (key === 'tls') {
            currentItem.tls = true;
            if (val && val !== '{}') {
              const crMatch = val.match(/certResolver\s*:\s*['"]?([a-zA-Z0-9_\-]+)['"]?/);
              if (crMatch) currentItem.certResolver = crMatch[1];
            }
          } else if (key === 'certResolver') {
            currentItem.tls = true;
            currentItem.certResolver = cleanQuote(val);
          } else if (key === 'middlewares') {
            currentItem.middlewares = currentItem.middlewares || [];
            currentItem.middlewareLines = currentItem.middlewareLines || {};
            // Inline array: ["mw-1@file", "mw-2@file"]
            if (val.startsWith('[') && val.endsWith(']')) {
              const items = parseInlineArray(val);
              items.forEach((item) => {
                currentItem.middlewares.push(item);
                currentItem.middlewareLines[item] = lineNumber;
              });
            }
          } else if (key === 'entryPoints') {
            currentItem.entryPoints = currentItem.entryPoints || [];
            if (val.startsWith('[') && val.endsWith(']')) {
              currentItem.entryPoints.push(...parseInlineArray(val));
            }
          }
        } else if (currentSection === 'services') {
          if (key === 'passHostHeader') {
            currentItem.passHostHeader = val.toLowerCase() === 'true';
          } else if (key === 'loadBalancer' || key === 'weighted' || key === 'mirroring') {
            currentItem.type = key;
          }
        } else if (currentSection === 'middlewares') {
          if (!currentItem.type) {
            currentItem.type = key;
            currentItem.raw = currentItem.raw || {};
            if (val) currentItem.raw[key] = val;
          }
        }
        continue;
      }

      // Check for list item lines: `- "value"` or `- url: "..."`
      const listMatch = trimmed.match(/^-\s*(.*)$/);
      if (listMatch) {
        const val = cleanQuote(listMatch[1].trim());

        if (currentSection === 'routers') {
          if (currentProperty === 'middlewares') {
            currentItem.middlewares = currentItem.middlewares || [];
            currentItem.middlewareLines = currentItem.middlewareLines || {};
            currentItem.middlewares.push(val);
            currentItem.middlewareLines[val] = lineNumber;
          } else if (currentProperty === 'entryPoints') {
            currentItem.entryPoints = currentItem.entryPoints || [];
            currentItem.entryPoints.push(val);
          }
        } else if (currentSection === 'services') {
          const urlMatch = val.match(/^url\s*:\s*['"]?([^'"]+)['"]?/);
          if (urlMatch) {
            currentItem.servers = currentItem.servers || [];
            currentItem.servers.push(urlMatch[1]);
          } else if (val.startsWith('http://') || val.startsWith('https://')) {
            currentItem.servers = currentItem.servers || [];
            currentItem.servers.push(val);
          }
        } else if (currentSection === 'middlewares') {
          currentItem.raw = currentItem.raw || {};
          if (currentProperty) {
            currentItem.raw[currentProperty] = currentItem.raw[currentProperty] || [];
            if (Array.isArray(currentItem.raw[currentProperty])) {
              currentItem.raw[currentProperty].push(val);
            }
          }
        }
        continue;
      }

      // Sub-properties (e.g. `certResolver: letsencrypt` under `tls:`, or `sourceRange:` under `ipAllowList:`)
      if (currentSection === 'routers' && (currentProperty === 'tls' || trimmed.startsWith('certResolver:'))) {
        const crSubMatch = trimmed.match(/^certResolver\s*:\s*['"]?([a-zA-Z0-9_\-]+)['"]?/);
        if (crSubMatch) {
          currentItem.tls = true;
          currentItem.certResolver = crSubMatch[1];
        }
      } else if (currentSection === 'services' && trimmed.startsWith('url:')) {
        const uMatch = trimmed.match(/^url\s*:\s*['"]?([^'"]+)['"]?/);
        if (uMatch) {
          currentItem.servers = currentItem.servers || [];
          currentItem.servers.push(uMatch[1]);
        }
      }
    }
  }

  finalizeCurrentItem();

  return { middlewares, routers, services };
}

function cleanQuote(str: string): string {
  if (!str) return '';
  str = str.trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

function parseInlineArray(str: string): string[] {
  const content = str.slice(1, -1).trim();
  if (!content) return [];
  return content
    .split(',')
    .map((s) => cleanQuote(s.trim()))
    .filter(Boolean);
}

export function extractHostFromRule(rule: string): string | undefined {
  if (!rule) return undefined;
  const hostMatch = rule.match(/Host\s*\(\s*[`'"]([^`'"]+)[`'"]\s*\)/i);
  if (hostMatch) {
    return hostMatch[1];
  }
  const regexpMatch = rule.match(/HostRegexp\s*\(\s*[`'"]([^`'"]+)[`'"]\s*\)/i);
  if (regexpMatch) {
    return regexpMatch[1];
  }
  return undefined;
}

export function buildMiddlewareSummary(type?: string, raw?: any): string {
  if (!type) return 'Custom Middleware';
  switch (type) {
    case 'ipAllowList': {
      const ranges = raw?.sourceRange;
      const count = Array.isArray(ranges) ? ranges.length : 1;
      return `ipAllowList (${count} CIDR${count > 1 ? 's' : ''})`;
    }
    case 'basicAuth':
      return 'basicAuth (Protected)';
    case 'headers':
      return 'Security Headers';
    case 'rateLimit':
      return 'Rate Limiting';
    case 'compress':
      return 'Gzip/Brotli Compression';
    case 'stripPrefix':
      return 'Prefix Stripper';
    case 'redirectRegex':
    case 'redirectScheme':
      return 'Redirect Rule';
    case 'forwardAuth':
      return 'Forward Authentication';
    case 'plugin':
      return 'Custom Traefik Plugin';
    default:
      return `${type} Middleware`;
  }
}
