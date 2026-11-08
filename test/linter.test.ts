import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lintTraefikIndex } from '../src/linter';
import { TraefikIndex, TraefikRouter, TraefikService, TraefikMiddleware } from '../src/types';

describe('Traefik Rules Linter', () => {
  it('should detect unresolved middleware references (@file and bare)', () => {
    const middlewares = new Map<string, TraefikMiddleware>();
    middlewares.set('mw-local-only', {
      id: 'mw-local-only',
      name: 'mw-local-only',
      file: 'rules/mw-local-only.yml',
      line: 4,
      type: 'ipAllowList',
      summary: 'ipAllowList (1 CIDR)',
    });

    const services = new Map<string, TraefikService>();
    services.set('app-svc', {
      id: 'app-svc',
      file: 'rules/ser-app.yml',
      line: 12,
      type: 'loadBalancer',
      servers: ['http://127.0.0.1:8080'],
    });

    const routers = new Map<string, TraefikRouter>();
    routers.set('app-secure', {
      id: 'app-secure',
      file: 'rules/ser-app.yml',
      line: 4,
      rule: 'Host(`app.example.com`)',
      host: 'app.example.com',
      entryPoints: ['websecure'],
      service: 'app-svc',
      serviceLine: 10,
      middlewares: ['mw-local-only@file', 'mw-missing@file'],
      middlewareLines: {
        'mw-local-only@file': 7,
        'mw-missing@file': 8,
      },
      tls: true,
    });

    const index: TraefikIndex = {
      middlewares,
      services,
      routers,
      files: ['rules/mw-local-only.yml', 'rules/ser-app.yml'],
      issues: [],
      lastScanTime: Date.now(),
    };

    const issues = lintTraefikIndex(index);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, 'UNRESOLVED_MIDDLEWARE');
    assert.match(issues[0].message, /mw-missing/);
    assert.equal(issues[0].file, 'rules/ser-app.yml');
    assert.equal(issues[0].line, 8);
  });

  it('should detect unresolved service reference', () => {
    const middlewares = new Map<string, TraefikMiddleware>();
    const services = new Map<string, TraefikService>();
    const routers = new Map<string, TraefikRouter>();

    routers.set('bad-router', {
      id: 'bad-router',
      file: 'rules/ser-bad.yml',
      line: 4,
      rule: 'Host(`bad.example.com`)',
      entryPoints: ['websecure'],
      service: 'non-existent-svc',
      serviceLine: 6,
      middlewares: [],
      tls: true,
    });

    const index: TraefikIndex = {
      middlewares,
      services,
      routers,
      files: ['rules/ser-bad.yml'],
      issues: [],
      lastScanTime: Date.now(),
    };

    const issues = lintTraefikIndex(index);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, 'UNRESOLVED_SERVICE');
    assert.equal(issues[0].line, 6);
  });

  it('should detect duplicate Host rule conflict on same entryPoint without priority', () => {
    const middlewares = new Map<string, TraefikMiddleware>();
    const services = new Map<string, TraefikService>();
    services.set('svc-1', {
      id: 'svc-1',
      file: 'ser-1.yml',
      line: 10,
      type: 'loadBalancer',
      servers: ['http://127.0.0.1:8001'],
    });
    services.set('svc-2', {
      id: 'svc-2',
      file: 'ser-2.yml',
      line: 10,
      type: 'loadBalancer',
      servers: ['http://127.0.0.1:8002'],
    });

    const routers = new Map<string, TraefikRouter>();
    routers.set('router-a', {
      id: 'router-a',
      file: 'ser-1.yml',
      line: 4,
      rule: 'Host(`dashboard.lan`)',
      host: 'dashboard.lan',
      entryPoints: ['websecure'],
      service: 'svc-1',
      middlewares: [],
      tls: true,
    });
    routers.set('router-b', {
      id: 'router-b',
      file: 'ser-2.yml',
      line: 4,
      rule: 'Host(`dashboard.lan`)',
      host: 'dashboard.lan',
      entryPoints: ['websecure'],
      service: 'svc-2',
      middlewares: [],
      tls: true,
    });

    const index: TraefikIndex = {
      middlewares,
      services,
      routers,
      files: ['ser-1.yml', 'ser-2.yml'],
      issues: [],
      lastScanTime: Date.now(),
    };

    const issues = lintTraefikIndex(index);
    const hostConflicts = issues.filter((i) => i.code === 'DUPLICATE_HOST');
    assert.ok(hostConflicts.length > 0);
    assert.match(hostConflicts[0].message, /dashboard\.lan/);
  });
});
