import { TraefikWorkspaceIndexer } from './indexer';
import { TraefikIndex } from './types';

export interface YamlContext {
  contextType: 'middlewares' | 'service' | 'entryPoints' | 'certResolver' | 'snippet' | 'unknown';
  isListItem: boolean;
  prefix: string;
}

export function getYamlContext(
  lines: string[],
  lineNumber: number,
  column: number
): YamlContext {
  const lineIdx = lineNumber - 1;
  const currentLine = lines[lineIdx] || '';
  const textUntilPos = currentLine.substring(0, column - 1);
  const trimmedUntil = textUntilPos.trim();

  // 1. Direct key checks on current line
  if (textUntilPos.includes('service:')) {
    return { contextType: 'service', isListItem: false, prefix: textUntilPos.split('service:')[1] || '' };
  }
  if (textUntilPos.includes('certResolver:')) {
    return { contextType: 'certResolver', isListItem: false, prefix: textUntilPos.split('certResolver:')[1] || '' };
  }

  // 2. Check if current line is a list item: e.g. `  - `, `  -`
  const isListItem = /^\s*-\s*/.test(textUntilPos) || /^\s*-\S*/.test(textUntilPos);

  if (isListItem) {
    const currentIndent = textUntilPos.search(/-/);

    // Look backwards up to 30 lines to find the parent key with smaller indent
    for (let i = lineIdx - 1; i >= 0 && i >= lineIdx - 30; i--) {
      const prevLine = lines[i];
      if (!prevLine || !prevLine.trim() || prevLine.trim().startsWith('#')) continue;

      const prevIndent = prevLine.search(/\S/);
      if (prevIndent < currentIndent) {
        const trimmedPrev = prevLine.trim();
        if (trimmedPrev.startsWith('middlewares:')) {
          return { contextType: 'middlewares', isListItem: true, prefix: textUntilPos.replace(/^\s*-[\s"']*/, '') };
        }
        if (trimmedPrev.startsWith('entryPoints:')) {
          return { contextType: 'entryPoints', isListItem: true, prefix: textUntilPos.replace(/^\s*-[\s"']*/, '') };
        }
        break;
      }
    }

    // Heuristic: if word has mw- or @, assume middlewares
    if (textUntilPos.includes('@') || textUntilPos.includes('mw-')) {
      return { contextType: 'middlewares', isListItem: true, prefix: textUntilPos.replace(/^\s*-[\s"']*/, '') };
    }
  }

  // 3. Top-level snippet context
  if (trimmedUntil === '' || trimmedUntil === 'http:' || trimmedUntil === 'routers:') {
    return { contextType: 'snippet', isListItem: false, prefix: '' };
  }

  return { contextType: 'unknown', isListItem: false, prefix: '' };
}

export function computeCompletionRangeAndText(
  lineContent: string,
  column: number,
  value: string,
  kind: 'list' | 'kv'
): { insertText: string; startCol: number; endCol: number } {
  const textUntilPos = lineContent.substring(0, column - 1);

  if (kind === 'list') {
    const dashMatch = textUntilPos.match(/^(\s*-)(.*)$/);
    if (dashMatch) {
      const dashPart = dashMatch[1]; // e.g. "        -"
      const afterDash = dashMatch[2]; // e.g. "" or " " or " loc" or "mw" or " \"mw"
      const dashCol = dashPart.length; // 1-based index of '-'

      if (afterDash === '') {
        // User typed just '-' without space: "        -"
        // We replace '-' with '- ' + value to guarantee clean YAML
        return {
          startCol: dashCol,
          endCol: column,
          insertText: `- ${value}`,
        };
      }

      const spaceMatch = afterDash.match(/^(\s+)(.*)$/);
      if (spaceMatch) {
        // User typed '- ' with space
        const spaces = spaceMatch[1];
        const startWordCol = dashCol + spaces.length + 1;

        return {
          startCol: startWordCol,
          endCol: column,
          insertText: value,
        };
      } else {
        // User typed '-word' without space (e.g. "-mw"):
        // Replace from '-' to cursor with '- ' + value
        return {
          startCol: dashCol,
          endCol: column,
          insertText: `- ${value}`,
        };
      }
    }

    return {
      startCol: column,
      endCol: column,
      insertText: value,
    };
  } else {
    // Key-value context (e.g. `service:` or `certResolver:`)
    const colonIdx = textUntilPos.lastIndexOf(':');
    if (colonIdx !== -1) {
      const colonCol = colonIdx + 1; // 1-based index of ':'
      const afterColon = textUntilPos.substring(colonIdx + 1);

      if (afterColon === '') {
        // User typed `service:` with no space
        // Replace ':' with ': ' + value to guarantee clean YAML space
        return {
          startCol: colonCol,
          endCol: column,
          insertText: `: ${value}`,
        };
      }

      const spaceMatch = afterColon.match(/^(\s+)(.*)$/);
      if (spaceMatch) {
        const startValCol = colonCol + spaceMatch[1].length + 1;
        return {
          startCol: startValCol,
          endCol: column,
          insertText: value,
        };
      } else {
        return {
          startCol: colonCol,
          endCol: column,
          insertText: `: ${value}`,
        };
      }
    }

    return {
      startCol: column,
      endCol: column,
      insertText: value,
    };
  }
}

export function getTraefikSuggestions(
  lineContent: string,
  lineNumber: number,
  column: number,
  lines: string[],
  index: TraefikIndex | null
): any[] {
  const suggestions: any[] = [];
  const ctx = getYamlContext(lines, lineNumber, column);

  if (ctx.contextType === 'middlewares' && index) {
    index.middlewares.forEach((mw) => {
      // 1. Bare unquoted name (User's preferred style): e.g. "local-only"
      const bareRange = computeCompletionRangeAndText(lineContent, column, mw.id, 'list');
      suggestions.push({
        label: mw.id,
        kind: 18, // Reference
        insertText: bareRange.insertText,
        range: {
          startLineNumber: lineNumber,
          startColumn: bareRange.startCol,
          endLineNumber: lineNumber,
          endColumn: bareRange.endCol,
        },
        detail: `Traefik Middleware (${mw.type}) — локальный`,
        sortText: `0_${mw.id}`,
        documentation: {
          value: `**${mw.id}** (${mw.summary || mw.type})\n\nDefined in [${mw.file}:${mw.line}](file://${mw.file}#L${mw.line})`,
        },
      });

      // 2. Explicit @file variant: e.g. "local-only@file"
      const withFile = `${mw.id}@file`;
      const fileRange = computeCompletionRangeAndText(lineContent, column, withFile, 'list');
      suggestions.push({
        label: withFile,
        kind: 18, // Reference
        insertText: fileRange.insertText,
        range: {
          startLineNumber: lineNumber,
          startColumn: fileRange.startCol,
          endLineNumber: lineNumber,
          endColumn: fileRange.endCol,
        },
        detail: `Traefik Middleware (${mw.type}) — @file`,
        sortText: `1_${mw.id}`,
        documentation: {
          value: `**${withFile}** (${mw.summary || mw.type})\n\nDefined in [${mw.file}:${mw.line}](file://${mw.file}#L${mw.line})`,
        },
      });

      // 3. If ID starts with `mw-`, also offer stripped version: e.g. "mw-security-headers" -> "security-headers"
      if (mw.id.startsWith('mw-')) {
        const stripped = mw.id.substring(3);
        const stripRange = computeCompletionRangeAndText(lineContent, column, stripped, 'list');
        suggestions.push({
          label: stripped,
          kind: 18, // Reference
          insertText: stripRange.insertText,
          range: {
            startLineNumber: lineNumber,
            startColumn: stripRange.startCol,
            endLineNumber: lineNumber,
            endColumn: stripRange.endCol,
          },
          detail: `Traefik Middleware (${mw.type}) — без mw-`,
          sortText: `0_0_${stripped}`,
          documentation: {
            value: `**${stripped}** (${mw.summary || mw.type})\n\nDefined as **${mw.id}** in [${mw.file}:${mw.line}](file://${mw.file}#L${mw.line})`,
          },
        });
      }
    });
  }

  if (ctx.contextType === 'service' && index) {
    index.services.forEach((svc) => {
      const svcRange = computeCompletionRangeAndText(lineContent, column, svc.id, 'kv');
      suggestions.push({
        label: svc.id,
        kind: 7, // Class
        insertText: svcRange.insertText,
        range: {
          startLineNumber: lineNumber,
          startColumn: svcRange.startCol,
          endLineNumber: lineNumber,
          endColumn: svcRange.endCol,
        },
        detail: `Traefik Service (${svc.type})`,
        sortText: `0_${svc.id}`,
        documentation: {
          value: `Target servers: ${svc.servers.join(', ') || 'None'}\n\nDefined in [${svc.file}:${svc.line}](file://${svc.file}#L${svc.line})`,
        },
      });
    });
  }

  if (ctx.contextType === 'entryPoints') {
    const defaultEps = ['websecure', 'web', 'traefik'];
    defaultEps.forEach((ep, idx) => {
      const epRange = computeCompletionRangeAndText(lineContent, column, ep, 'list');
      suggestions.push({
        label: ep,
        kind: 12, // Value
        insertText: epRange.insertText,
        range: {
          startLineNumber: lineNumber,
          startColumn: epRange.startCol,
          endLineNumber: lineNumber,
          endColumn: epRange.endCol,
        },
        detail: ep === 'websecure' ? 'HTTPS (Port 443)' : ep === 'web' ? 'HTTP (Port 80)' : 'Internal Dashboard (8080)',
        sortText: `0_${idx}_${ep}`,
      });
    });
  }

  if (ctx.contextType === 'certResolver') {
    const defaultResolvers = ['cloudflare-resolver', 'letsencrypt', 'le-http', 'le-dns'];
    defaultResolvers.forEach((cr, idx) => {
      const crRange = computeCompletionRangeAndText(lineContent, column, cr, 'kv');
      suggestions.push({
        label: cr,
        kind: 12, // Value
        insertText: crRange.insertText,
        range: {
          startLineNumber: lineNumber,
          startColumn: crRange.startCol,
          endLineNumber: lineNumber,
          endColumn: crRange.endCol,
        },
        detail: `CertResolver (${cr})`,
        sortText: `0_${idx}_${cr}`,
      });
    });
  }

  if (ctx.contextType === 'snippet') {
    suggestions.push({
      label: 'traefik-router-service',
      kind: 15, // Snippet
      insertText: [
        'http:',
        '  routers:',
        '    ${1:app}-router:',
        '      rule: "Host(`${2:app.example.com}`)"',
        '      entryPoints:',
        '        - websecure',
        '      middlewares:',
        '        - ${3:local-only}',
        '      service: ${1:app}-service',
        '      tls:',
        '        certResolver: ${4:cloudflare-resolver}',
        '',
        '  services:',
        '    ${1:app}-service:',
        '      loadBalancer:',
        '        servers:',
        '          - url: "http://${5:127.0.0.1:8080}"',
        '        passHostHeader: true',
      ].join('\n'),
      insertTextRules: 4, // InsertAsSnippet
      detail: 'Traefik Router + Service LoadBalancer (Clean YAML format)',
    });

    suggestions.push({
      label: 'traefik-middleware-ipAllowList',
      kind: 15, // Snippet
      insertText: [
        'http:',
        '  middlewares:',
        '    ${1:local-only}:',
        '      ipAllowList:',
        '        sourceRange:',
        '          - "127.0.0.1/32"',
        '          - "${2:192.168.1.0/24}"',
      ].join('\n'),
      insertTextRules: 4, // InsertAsSnippet
      detail: 'Traefik IP AllowList Middleware snippet',
    });
  }

  return suggestions;
}

export function setupMonacoTraefik(monaco: any, indexer: TraefikWorkspaceIndexer) {
  if (!monaco || !monaco.languages) return;

  // 1. Monaco Autocompletion Provider for YAML
  monaco.languages.registerCompletionItemProvider('yaml', {
    triggerCharacters: ['-', '@', ':', ' '],
    provideCompletionItems: (model: any, position: any) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const lines = model.getLinesContent ? model.getLinesContent() : model.getValue().split(/\r?\n/);
      const index = indexer.getIndex();
      const suggestions = getTraefikSuggestions(lineContent, position.lineNumber, position.column, lines, index);
      return { suggestions };
    },
  });

  // 2. Monaco Go to Definition Provider (F12 / Cmd-click)
  monaco.languages.registerDefinitionProvider('yaml', {
    provideDefinition: (model: any, position: any) => {
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) return null;

      const lineContent = model.getLineContent(position.lineNumber);
      const before = lineContent.substring(0, wordInfo.endColumn - 1);
      const after = lineContent.substring(wordInfo.endColumn - 1);

      let fullToken = wordInfo.word;
      if (after.startsWith('@file')) {
        fullToken = `${wordInfo.word}@file`;
      } else if (before.endsWith('@') || lineContent.includes(`${wordInfo.word}@file`)) {
        fullToken = `${wordInfo.word}@file`;
      }

      const def = indexer.findDefinition(fullToken) || indexer.findDefinition(wordInfo.word);
      if (!def) return null;

      const currentPath = (window as any).ConfigStudio?.getActiveFile?.()?.path || '';

      if (def.file !== currentPath && (window as any).ConfigStudio?.openFile) {
        setTimeout(() => {
          (window as any).ConfigStudio.openFile(def.file, { line: def.line, highlight: true });
        }, 10);
      }

      if (def.file === currentPath) {
        return {
          uri: model.uri,
          range: {
            startLineNumber: def.line,
            startColumn: 1,
            endLineNumber: def.line,
            endColumn: 100,
          },
        };
      }

      return null;
    },
  });

  // 3. Monaco Hover Provider for Traefik entities
  monaco.languages.registerHoverProvider?.('yaml', {
    provideHover: (model: any, position: any) => {
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) return null;
      const index = indexer.getIndex();
      if (!index) return null;

      const token = wordInfo.word;
      const def = indexer.findDefinition(token) || indexer.findDefinition(`${token}@file`);
      if (!def) return null;

      let mdText = '';
      if (def.type === 'middleware') {
        const cleanToken = token.replace(/@file$/, '');
        const mw =
          index.middlewares.get(cleanToken) ||
          index.middlewares.get(`mw-${cleanToken}`) ||
          (cleanToken.startsWith('mw-') ? index.middlewares.get(cleanToken.substring(3)) : null);
        mdText = `**Traefik Middleware**: \`${mw?.id || token}\`\n\n- **Type**: \`${mw?.type || 'unknown'}\`\n- **Summary**: ${mw?.summary || 'N/A'}\n- **Defined in**: [${def.file}:${def.line}](file://${def.file}#L${def.line})`;
      } else if (def.type === 'service') {
        const cleanToken = token.replace(/@file$/, '');
        const svc = index.services.get(cleanToken);
        mdText = `**Traefik Service**: \`${svc?.id || token}\`\n\n- **Type**: \`${svc?.type || 'loadBalancer'}\`\n- **Servers**: ${svc?.servers.join(', ') || 'N/A'}\n- **Defined in**: [${def.file}:${def.line}](file://${def.file}#L${def.line})`;
      }

      return {
        contents: [{ value: mdText }],
      };
    },
  });
}
