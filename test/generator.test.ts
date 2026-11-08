import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateServiceYaml } from '../src/generator';
import { parseTraefikYaml } from '../src/parser';

describe('Traefik Service YAML Generator', () => {
  it('should generate valid HTTPS router and service with middlewares', () => {
    const yaml = generateServiceYaml({
      name: 'jellyfin',
      host: 'jellyfin.example.com',
      targetUrl: 'http://192.168.1.50:8096',
      entryPoint: 'websecure',
      enableTls: true,
      certResolver: 'letsencrypt',
      middlewares: ['mw-local-only@file', 'mw-headers@file'],
    });

    assert.match(yaml, /jellyfin-router:/);
    assert.match(yaml, /rule: "Host\(`jellyfin\.example\.com`\)"/);
    assert.match(yaml, /certResolver: letsencrypt/);
    assert.match(yaml, /service: jellyfin-service/);
    assert.match(yaml, /url: "http:\/\/192\.168\.1\.50:8096"/);

    // Verify it is parseable by parseTraefikYaml!
    const parsed = parseTraefikYaml(yaml, 'ser-jellyfin.yml');
    assert.equal(parsed.routers.length, 1);
    assert.equal(parsed.routers[0].host, 'jellyfin.example.com');
    assert.deepEqual(parsed.routers[0].middlewares, ['mw-local-only@file', 'mw-headers@file']);
    assert.equal(parsed.services.length, 1);
    assert.deepEqual(parsed.services[0].servers, ['http://192.168.1.50:8096']);
  });

  it('should generate plain HTTP router when TLS is disabled', () => {
    const yaml = generateServiceYaml({
      name: 'internal-tool',
      host: 'tool.lan',
      targetUrl: 'http://10.0.0.5:80',
      entryPoint: 'web',
      enableTls: false,
      certResolver: '',
      middlewares: [],
    });

    assert.doesNotMatch(yaml, /tls:/);
    assert.match(yaml, /- web/);
    assert.match(yaml, /internal-tool:/);

    const parsed = parseTraefikYaml(yaml, 'ser-tool.yml');
    assert.equal(parsed.routers[0].tls, false);
    assert.equal(parsed.routers[0].entryPoints[0], 'web');
  });
});
