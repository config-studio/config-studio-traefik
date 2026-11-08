import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTraefikYaml } from '../src/parser';

describe('Traefik YAML Parser', () => {
  it('should parse middlewares from mw-local.yml correctly', () => {
    const yaml = `
http:
  middlewares:
    mw-local-only:
      ipAllowList:
        sourceRange:
          - "127.0.0.1/32"
          - "192.168.1.0/24"
    mw-security-headers:
      headers:
        sslRedirect: true
        stsSeconds: 31536000
`;
    const result = parseTraefikYaml(yaml, 'rules/mw-local-only.yml');

    assert.equal(result.middlewares.length, 2);

    const mw1 = result.middlewares.find((m) => m.id === 'mw-local-only');
    assert.ok(mw1);
    assert.equal(mw1.type, 'ipAllowList');
    assert.equal(mw1.file, 'rules/mw-local-only.yml');
    assert.equal(mw1.line, 4); // 1-based line of mw-local-only
    assert.match(mw1.summary, /2 CIDRs/i);

    const mw2 = result.middlewares.find((m) => m.id === 'mw-security-headers');
    assert.ok(mw2);
    assert.equal(mw2.type, 'headers');
    assert.equal(mw2.line, 9);
  });

  it('should parse routers and services from ser-jellyfin.yml correctly', () => {
    const yaml = `
http:
  routers:
    jellyfin-secure:
      rule: "Host(\`jellyfin.example.com\`)"
      entryPoints:
        - "websecure"
      middlewares:
        - "mw-local-only@file"
        - "mw-security-headers@file"
      service: "jellyfin-svc"
      tls:
        certResolver: "letsencrypt"

  services:
    jellyfin-svc:
      loadBalancer:
        servers:
          - url: "http://192.168.1.50:8096"
        passHostHeader: true
`;
    const result = parseTraefikYaml(yaml, 'rules/ser-jellyfin.yml');

    assert.equal(result.routers.length, 1);
    const r = result.routers[0];
    assert.equal(r.id, 'jellyfin-secure');
    assert.equal(r.line, 4);
    assert.equal(r.rule, 'Host(`jellyfin.example.com`)');
    assert.equal(r.host, 'jellyfin.example.com');
    assert.deepEqual(r.entryPoints, ['websecure']);
    assert.equal(r.service, 'jellyfin-svc');
    assert.equal(r.serviceLine, 11);
    assert.deepEqual(r.middlewares, ['mw-local-only@file', 'mw-security-headers@file']);
    assert.equal(r.middlewareLines?.['mw-local-only@file'], 9);
    assert.equal(r.middlewareLines?.['mw-security-headers@file'], 10);
    assert.equal(r.tls, true);
    assert.equal(r.certResolver, 'letsencrypt');

    assert.equal(result.services.length, 1);
    const s = result.services[0];
    assert.equal(s.id, 'jellyfin-svc');
    assert.equal(s.line, 16);
    assert.deepEqual(s.servers, ['http://192.168.1.50:8096']);
    assert.equal(s.passHostHeader, true);
  });

  it('should extract complex Host rules with PathPrefix and backticks or quotes', () => {
    const yaml = `
http:
  routers:
    api-router:
      rule: 'Host("api.myhub.org") && PathPrefix("/v1")'
      service: api-svc
`;
    const result = parseTraefikYaml(yaml, 'rules/ser-api.yml');
    assert.equal(result.routers[0].host, 'api.myhub.org');
  });

  it('should handle inline list middlewares syntax: [mw-1@file, mw-2@file]', () => {
    const yaml = `
http:
  routers:
    inline-router:
      rule: "Host(\`inline.example.com\`)"
      middlewares: ["mw-auth@file", "mw-compress@file"]
      service: "inline-svc"
`;
    const result = parseTraefikYaml(yaml, 'rules/ser-inline.yml');
    const r = result.routers[0];
    assert.deepEqual(r.middlewares, ['mw-auth@file', 'mw-compress@file']);
    assert.equal(r.middlewareLines?.['mw-auth@file'], 6);
  });
});
