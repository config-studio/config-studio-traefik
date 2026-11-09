import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createTraefikOutlineProvider } from '../src/outlineProvider';

describe('Traefik Hierarchical Outline Provider', () => {
  const provider = createTraefikOutlineProvider();

  it('should generate hierarchical Traefik outline for ser-config.yml', () => {
    const yaml = `http:
  routers:
    config-router:
      rule: "Host(\`myservice.example.com\`)"
      entryPoints:
        - websecure
      middlewares:
        - mw-local-only
        - mw-security-headers
      service: config-service
      tls:
        certResolver: letsencrypt

  services:
    config-service:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:8080"
        passHostHeader: true
`;

    const nodes = provider.parse(yaml, 'rules/ser-config.yml');

    assert.ok(nodes.length >= 2, 'Should have Routers and Services sections');

    const routerSec = nodes.find((n) => n.id === 'section_routers');
    assert.ok(routerSec, 'Routers section must exist');
    assert.strictEqual(routerSec.line, 2, 'Routers section line should match "routers:" line');
    assert.ok(routerSec.label.includes('Маршрутизаторы (1)'));

    const rNode = routerSec.children?.[0];
    assert.ok(rNode, 'config-router must exist in outline');
    assert.strictEqual(rNode.line, 3);
    assert.ok(rNode.label.includes('config-router'));
    assert.ok(rNode.label.includes('myservice.example.com'));

    // Children of router: middlewares and service
    const mwNode = rNode.children?.find((c) => c.label.includes('mw-local-only'));
    assert.ok(mwNode, 'Middleware mw-local-only child should exist');
    assert.strictEqual(mwNode.line, 8);

    const svcRefNode = rNode.children?.find((c) => c.label.includes('config-service'));
    assert.ok(svcRefNode, 'Service reference child should exist');
    assert.strictEqual(svcRefNode.line, 10);

    // Services section
    const serviceSec = nodes.find((n) => n.id === 'section_services');
    assert.ok(serviceSec, 'Services section must exist');
    assert.strictEqual(serviceSec.line, 14, 'Services section line should match "services:" line');

    const sNode = serviceSec.children?.[0];
    assert.ok(sNode, 'config-service node must exist');
    assert.strictEqual(sNode.line, 15);
    assert.ok(sNode.label.includes('http://127.0.0.1:8080'));
  });

  it('should generate outline for mw-*.yml middlewares', () => {
    const yaml = `http:
  middlewares:
    mw-security-headers:
      headers:
        sslRedirect: true
        browserXssFilter: true
`;

    const nodes = provider.parse(yaml, 'rules/mw-security.yml');
    const mwSec = nodes.find((n) => n.id === 'section_middlewares');
    assert.ok(mwSec, 'Middlewares section must exist');
    assert.strictEqual(mwSec.line, 2);

    const mwNode = mwSec.children?.[0];
    assert.ok(mwNode);
    assert.strictEqual(mwNode.line, 3);
    assert.ok(mwNode.label.includes('mw-security-headers'));
    assert.ok(mwNode.label.includes('Security Headers'));
  });

  it('should return empty outline for non-Traefik YAML to fallback to generic AST parser', () => {
    const genericYaml = `version: "3.8"
services:
  web:
    image: nginx:alpine
`;
    const nodes = provider.parse(genericYaml, 'docker-compose.yml');
    assert.strictEqual(nodes.length, 0, 'Generic compose should return empty to trigger fallback');
  });

  it('should handle both .yml and .yaml files in rules/ directory', () => {
    const yaml = `http:
  routers:
    test-router:
      rule: "Host(\`test.local\`)"
      service: test-service
`;
    const nodesYml = provider.parse(yaml, 'rules/my-route.yml');
    const nodesYaml = provider.parse(yaml, 'rules/my-route.yaml');

    assert.ok(nodesYml.length > 0);
    assert.ok(nodesYaml.length > 0);
  });
});
