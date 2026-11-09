import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runLocalAudit, queryTraefikApi } from '../src/doctor';
import { TraefikIndex, LinterIssue } from '../src/types';

describe('Traefik Doctor & Diagnostics', () => {
  it('should generate healthy local report when there are no issues', () => {
    const mockIndex: TraefikIndex = {
      routers: new Map([
        ['app-router', { id: 'app-router', file: 'rules/ser-app.yml', line: 5, rule: 'Host(`app.example.com`)', entryPoints: ['websecure'], service: 'app-service', middlewares: ['mw-auth'], tls: true }],
      ]),
      services: new Map([
        ['app-service', { id: 'app-service', file: 'rules/ser-app.yml', line: 15, type: 'loadBalancer', servers: ['http://127.0.0.1:3000'] }],
      ]),
      middlewares: new Map([
        ['mw-auth', { id: 'mw-auth', name: 'mw-auth', file: 'rules/mw-auth.yml', line: 3, type: 'basicAuth', summary: 'BasicAuth' }],
      ]),
      files: ['rules/ser-app.yml', 'rules/mw-auth.yml'],
      issues: [],
      lastScanTime: Date.now(),
    };

    const report = runLocalAudit(mockIndex);
    assert.equal(report.overallStatus, 'healthy');
    assert.equal(report.localSummary.routersCount, 1);
    assert.equal(report.localSummary.servicesCount, 1);
    assert.equal(report.localSummary.middlewaresCount, 1);
    assert.equal(report.localSummary.issuesCount, 0);
    assert.equal(report.localSummary.errorsCount, 0);
  });

  it('should detect error status when unresolved references exist', () => {
    const issues: LinterIssue[] = [
      {
        severity: 'error',
        code: 'UNRESOLVED_MIDDLEWARE',
        message: "Middleware 'mw-missing' not found",
        file: 'rules/ser-broken.yml',
        line: 8,
      },
      {
        severity: 'warning',
        code: 'DUPLICATE_HOST',
        message: "Duplicate Host('test.lan')",
        file: 'rules/ser-dup.yml',
        line: 4,
      },
    ];

    const mockIndex: TraefikIndex = {
      routers: new Map(),
      services: new Map(),
      middlewares: new Map(),
      files: ['rules/ser-broken.yml'],
      issues,
      lastScanTime: Date.now(),
    };

    const report = runLocalAudit(mockIndex);
    assert.equal(report.overallStatus, 'error');
    assert.equal(report.localSummary.issuesCount, 2);
    assert.equal(report.localSummary.errorsCount, 1);
    assert.equal(report.localSummary.warningsCount, 1);
  });

  it('should successfully query mock Traefik REST API and parse runtime status', async () => {
    const mockFetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/version')) {
        return {
          ok: true,
          json: async () => ({ version: 'v3.1.2', codename: 'parihaka', startDate: '2026-11-09T10:00:00Z' }),
        } as any;
      }
      if (urlStr.includes('/api/overview')) {
        return {
          ok: true,
          json: async () => ({
            http: {
              routers: { total: 5, warnings: 0, errors: 1 },
              services: { total: 4, warnings: 0, errors: 0 },
              middlewares: { total: 6, warnings: 0, errors: 0 },
            },
          }),
        } as any;
      }
      if (urlStr.includes('/api/rawdata')) {
        return {
          ok: true,
          json: async () => ({
            routers: {
              'app-router@file': { status: 'enabled', rule: 'Host(`app.lan`)', service: 'app-service@file' },
              'broken-router@file': { status: 'disabled', err: ['middleware mw-unknown not found'], rule: 'Host(`broken.lan`)' },
            },
            services: {
              'app-service@file': { status: 'enabled' },
            },
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const apiStatus = await queryTraefikApi('http://localhost:8080', undefined, mockFetch as any);
    assert.equal(apiStatus.reachable, true);
    assert.equal(apiStatus.version, 'v3.1.2 (parihaka)');
    assert.equal(apiStatus.overview?.httpRoutersTotal, 5);
    assert.equal(apiStatus.runtimeErrors.length, 1);
    assert.equal(apiStatus.runtimeErrors[0].name, 'broken-router@file');
    assert.equal(apiStatus.runtimeErrors[0].status, 'disabled');
    assert.match(apiStatus.runtimeErrors[0].errors?.[0] || '', /mw-unknown/);
  });

  it('should handle offline Traefik API gracefully without throwing unhandled exceptions', async () => {
    const failingFetch = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8080');
    };

    const apiStatus = await queryTraefikApi('http://localhost:8080', undefined, failingFetch as any);
    assert.equal(apiStatus.reachable, false);
    assert.match(apiStatus.error || '', /ECONNREFUSED/);
  });
});
