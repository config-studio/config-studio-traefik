import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TraefikWorkspaceIndexer } from '../src/indexer';

describe('Traefik Workspace Indexer', () => {
  it('should index multiple files and resolve cross-file references and locations', async () => {
    const fileContents: Record<string, string> = {
      'rules/mw-security.yml': `
http:
  middlewares:
    mw-local-only:
      ipAllowList:
        sourceRange:
          - "192.168.1.0/24"
    mw-tls-certs:
      headers:
        sslRedirect: true
`,
      'rules/ser-jellyfin.yml': `
http:
  routers:
    jellyfin-secure:
      rule: "Host(\`jellyfin.local\`)"
      middlewares:
        - "mw-local-only@file"
        - "mw-tls-certs@file"
      service: "jellyfin-svc"
      tls:
        certResolver: "letsencrypt"

  services:
    jellyfin-svc:
      loadBalancer:
        servers:
          - url: "http://192.168.1.50:8096"
`,
    };

    const mockFs = {
      listFiles: async () => Object.keys(fileContents),
      readFile: async (path: string) => fileContents[path] || '',
    };

    const indexer = new TraefikWorkspaceIndexer(mockFs);
    const index = await indexer.scanWorkspace();

    assert.equal(index.files.length, 2);
    assert.equal(index.middlewares.size, 2);
    assert.ok(index.middlewares.has('mw-local-only'));
    assert.ok(index.middlewares.has('mw-tls-certs'));

    assert.equal(index.services.size, 1);
    assert.ok(index.services.has('jellyfin-svc'));

    assert.equal(index.routers.size, 1);
    assert.ok(index.routers.has('jellyfin-secure'));

    // Test cross-file Go to Definition resolution
    const mwDef = indexer.findDefinition('mw-local-only@file');
    assert.ok(mwDef);
    assert.equal(mwDef.file, 'rules/mw-security.yml');
    assert.equal(mwDef.line, 4);

    const svcDef = indexer.findDefinition('jellyfin-svc@file');
    assert.ok(svcDef);
    assert.equal(svcDef.file, 'rules/ser-jellyfin.yml');
    assert.equal(svcDef.line, 14);

    // Linter issues should be empty (clean config)
    assert.equal(index.issues.length, 0);

    // rulesDir should be correctly detected as 'rules'
    assert.equal(index.rulesDir, 'rules');
  });

  it('should detect rules directory and ignore unrelated configs', async () => {
    const fileContents: Record<string, string> = {
      'config.yaml': `
port: 7890
socks-port: 7891
mode: rule
`,
      'rules/app.yml': `
http:
  routers:
    app-router:
      rule: "Host(\`app.example.com\`)"
      service: "app-service"
  services:
    app-service:
      loadBalancer:
        servers:
          - url: "http://10.0.0.5:8080"
`,
    };

    const mockFs = {
      listFiles: async () => Object.keys(fileContents),
      readFile: async (path: string) => fileContents[path] || '',
    };

    const indexer = new TraefikWorkspaceIndexer(mockFs);
    const index = await indexer.scanWorkspace();

    assert.equal(index.rulesDir, 'rules');
    assert.equal(index.routers.size, 1);
    assert.ok(index.routers.has('app-router'));
    assert.equal(index.services.size, 1);
    // config.yaml has no traefik rules, should not be included in traefik files
    assert.deepEqual(index.files, ['rules/app.yml']);
  });
});
