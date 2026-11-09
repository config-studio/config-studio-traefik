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
    assert.deepEqual(parsed.routers[0].middlewares, ['mw-local-only', 'mw-headers']);
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

  it('should generate valid middleware YAML for each blueprint recipe', () => {
    const { MIDDLEWARE_BLUEPRINTS, generateMiddlewareYaml } = require('../src/generator');

    assert.ok(MIDDLEWARE_BLUEPRINTS.length >= 7, 'Should have at least 7 middleware blueprints');

    // 1. Security Headers
    const secHeaders = generateMiddlewareYaml('security-headers', 'mw-security-headers', {});
    assert.match(secHeaders, /mw-security-headers:/);
    assert.match(secHeaders, /sslRedirect: true/);
    assert.match(secHeaders, /contentTypeNosniff: true/);
    assert.match(secHeaders, /customFrameOptionsValue: "SAMEORIGIN"/);
    const parsedSec = parseTraefikYaml(secHeaders, 'mw-security-headers.yml');
    assert.equal(parsedSec.middlewares.length, 1);
    assert.equal(parsedSec.middlewares[0].id, 'mw-security-headers');

    // 2. Rate Limit
    const rateLimit = generateMiddlewareYaml('rate-limit', 'mw-api-limit', { average: 50, burst: 20, period: '1s' });
    assert.match(rateLimit, /mw-api-limit:/);
    assert.match(rateLimit, /average: 50/);
    assert.match(rateLimit, /burst: 20/);
    const parsedLimit = parseTraefikYaml(rateLimit, 'mw-api-limit.yml');
    assert.equal(parsedLimit.middlewares.length, 1);

    // 3. Basic Auth
    const auth = generateMiddlewareYaml('basic-auth', 'mw-basic-auth', { users: 'admin:$apr1$test, guest:$apr1$test2' });
    assert.match(auth, /mw-basic-auth:/);
    assert.match(auth, /users:/);
    assert.match(auth, /admin:\$apr1\$test/);
    const parsedAuth = parseTraefikYaml(auth, 'mw-basic-auth.yml');
    assert.equal(parsedAuth.middlewares.length, 1);

    // 4. IP AllowList
    const ipList = generateMiddlewareYaml('ip-allowlist', 'mw-local-only', { sourceRange: '192.168.1.0/24\n10.0.0.0/8' });
    assert.match(ipList, /mw-local-only:/);
    assert.match(ipList, /sourceRange:/);
    assert.match(ipList, /192\.168\.1\.0\/24/);
    const parsedIp = parseTraefikYaml(ipList, 'mw-local-only.yml');
    assert.equal(parsedIp.middlewares.length, 1);

    // 5. Redirect Scheme
    const redir = generateMiddlewareYaml('redirect-scheme', 'mw-https-redirect', { scheme: 'https', permanent: true });
    assert.match(redir, /redirectScheme:/);
    assert.match(redir, /scheme: "https"/);
    const parsedRedir = parseTraefikYaml(redir, 'mw-redirect.yml');
    assert.equal(parsedRedir.middlewares.length, 1);

    // 6. Compress
    const comp = generateMiddlewareYaml('compress', 'mw-gzip', { minResponseBodyBytes: 2048 });
    assert.match(comp, /compress:/);
    assert.match(comp, /minResponseBodyBytes: 2048/);
    const parsedComp = parseTraefikYaml(comp, 'mw-gzip.yml');
    assert.equal(parsedComp.middlewares.length, 1);

    // 7. CrowdSec Bouncer
    const crowdsec = generateMiddlewareYaml('crowdsec', 'mw-crowdsec', { crowdsecMode: 'live', updateInterval: '15s' });
    assert.match(crowdsec, /crowdsecBouncer:/);
    assert.match(crowdsec, /updateInterval: "15s"/);
    const parsedCs = parseTraefikYaml(crowdsec, 'mw-crowdsec.yml');
    assert.equal(parsedCs.middlewares.length, 1);
  });
});
