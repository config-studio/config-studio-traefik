import { TraefikWorkspaceIndexer } from './indexer';

export function setupMonacoTraefik(monaco: any, indexer: TraefikWorkspaceIndexer) {
  if (!monaco || !monaco.languages) return;

  // 1. Monaco Autocompletion Provider for YAML
  monaco.languages.registerCompletionItemProvider('yaml', {
    triggerCharacters: ['-', '@', ':', ' '],
    provideCompletionItems: (model: any, position: any) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const textUntilPosition = lineContent.substring(0, position.column - 1);
      const index = indexer.getIndex();

      const suggestions: any[] = [];

      // Check if typing inside `middlewares:`
      const isMiddlewareContext =
        textUntilPosition.trim().startsWith('-') ||
        textUntilPosition.includes('middlewares:') ||
        textUntilPosition.includes('@');

      if (isMiddlewareContext && index) {
        index.middlewares.forEach((mw) => {
          const insertWithFile = `${mw.id}@file`;
          suggestions.push({
            label: insertWithFile,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: insertWithFile,
            detail: `Traefik Middleware (${mw.type})`,
            documentation: {
              value: `**${mw.id}** (${mw.summary || mw.type})\n\nDefined in [${mw.file}:${mw.line}](file://${mw.file}#L${mw.line})`,
            },
          });
        });
      }

      // Check if typing `service: `
      if (textUntilPosition.includes('service:') && index) {
        index.services.forEach((svc) => {
          suggestions.push({
            label: svc.id,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: svc.id,
            detail: `Traefik Service (${svc.type})`,
            documentation: {
              value: `Target servers: ${svc.servers.join(', ') || 'None'}\n\nDefined in [${svc.file}:${svc.line}](file://${svc.file}#L${svc.line})`,
            },
          });
        });
      }

      // Common Traefik dynamic configuration snippets
      if (textUntilPosition.trim() === '' || textUntilPosition.trim() === 'http:') {
        suggestions.push({
          label: 'traefik-router-service',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            'http:',
            '  routers:',
            '    ${1:app}-secure:',
            '      rule: "Host(`$2`)"',
            '      entryPoints:',
            '        - "websecure"',
            '      middlewares:',
            '        - "$3@file"',
            '      service: "$1-svc"',
            '      tls:',
            '        certResolver: "letsencrypt"',
            '',
            '  services:',
            '    $1-svc:',
            '      loadBalancer:',
            '        servers:',
            '          - url: "http://${4:127.0.0.1:8080}"',
            '        passHostHeader: true',
          ].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Traefik Router + Service LoadBalancer snippet',
        });

        suggestions.push({
          label: 'traefik-middleware-ipAllowList',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            'http:',
            '  middlewares:',
            '    mw-${1:local-only}:',
            '      ipAllowList:',
            '        sourceRange:',
            '          - "127.0.0.1/32"',
            '          - "${2:192.168.1.0/24}"',
          ].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Traefik IP AllowList Middleware snippet',
        });
      }

      return { suggestions };
    },
  });

  // 2. Monaco Go to Definition Provider (F12 / Cmd-click)
  monaco.languages.registerDefinitionProvider('yaml', {
    provideDefinition: (model: any, position: any) => {
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) return null;

      // Check full string under cursor (e.g. `mw-local-only@file`)
      const lineContent = model.getLineContent(position.lineNumber);
      const before = lineContent.substring(0, wordInfo.endColumn - 1);
      const after = lineContent.substring(wordInfo.endColumn - 1);

      // Expand to catch `@file` if cursor is on word before `@`
      let fullToken = wordInfo.word;
      if (after.startsWith('@file')) {
        fullToken = `${wordInfo.word}@file`;
      } else if (before.endsWith('@') || lineContent.includes(`${wordInfo.word}@file`)) {
        fullToken = `${wordInfo.word}@file`;
      }

      const def = indexer.findDefinition(fullToken) || indexer.findDefinition(wordInfo.word);
      if (!def) return null;

      const currentPath = (window as any).ConfigStudio?.getActiveFile?.()?.path || '';

      // If definition is in another file, trigger openFile with line highlight!
      if (def.file !== currentPath && (window as any).ConfigStudio?.openFile) {
        setTimeout(() => {
          (window as any).ConfigStudio.openFile(def.file, { line: def.line, highlight: true });
        }, 10);
      }

      // Return Monaco definition location for the current model if same file
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
}
