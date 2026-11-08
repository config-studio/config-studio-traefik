import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCompletionRangeAndText,
  getYamlContext,
  getTraefikSuggestions,
  extractTokenAtPosition,
} from '../src/monacoProvider';
import { TraefikIndex } from '../src/types';

describe('Monaco Traefik Completion & YAML Context', () => {
  it('should fix missing space when completing right after dash: "        -"', () => {
    const line = '        -';
    const col = 10; // cursor right after '-'
    const res = computeCompletionRangeAndText(line, col, 'local-only', 'list');

    assert.equal(res.startCol, 9); // start at '-'
    assert.equal(res.endCol, 10);
    assert.equal(res.insertText, '- local-only');
  });

  it('should keep single space when completing after dash with space: "        - "', () => {
    const line = '        - ';
    const col = 11; // cursor after '- '
    const res = computeCompletionRangeAndText(line, col, 'local-only', 'list');

    assert.equal(res.startCol, 11);
    assert.equal(res.endCol, 11);
    assert.equal(res.insertText, 'local-only');
  });

  it('should fix no-space word prefix: "        -mw"', () => {
    const line = '        -mw';
    const col = 12; // cursor after '-mw'
    const res = computeCompletionRangeAndText(line, col, 'local-only', 'list');

    assert.equal(res.startCol, 9);
    assert.equal(res.endCol, 12);
    assert.equal(res.insertText, '- local-only');
  });

  it('should replace partial word after space: "        - loc"', () => {
    const line = '        - loc';
    const col = 14;
    const res = computeCompletionRangeAndText(line, col, 'local-only', 'list');

    assert.equal(res.startCol, 11);
    assert.equal(res.endCol, 14);
    assert.equal(res.insertText, 'local-only');
  });

  it('should clean quotes if present: "        - \"mw"', () => {
    const line = '        - "mw';
    const col = 15;
    const res = computeCompletionRangeAndText(line, col, 'local-only', 'list');

    assert.equal(res.startCol, 11);
    assert.equal(res.endCol, 15);
    assert.equal(res.insertText, 'local-only');
  });

  it('should ensure space after colon for key-value: "      service:"', () => {
    const line = '      service:';
    const col = 15; // cursor right after ':'
    const res = computeCompletionRangeAndText(line, col, 'pcshare-service', 'kv');

    assert.equal(res.startCol, 14);
    assert.equal(res.endCol, 15);
    assert.equal(res.insertText, ': pcshare-service');
  });

  it('should correctly identify parent key for list items', () => {
    const lines = [
      'http:',
      '  routers:',
      '    pcshare-router:',
      '      middlewares:',
      '        - ',
    ];
    const ctx = getYamlContext(lines, 5, 11);
    assert.equal(ctx.contextType, 'middlewares');
    assert.equal(ctx.isListItem, true);
  });

  it('should prioritize exact declared names first without @file and keep @file as secondary', () => {
    const mockIndex: TraefikIndex = {
      middlewares: new Map([
        [
          'mw-security-headers',
          {
            id: 'mw-security-headers',
            name: 'mw-security-headers',
            file: 'rules/mw-security.yml',
            line: 3,
            type: 'headers',
            summary: 'Security Headers',
          },
        ],
      ]),
      services: new Map(),
      routers: new Map(),
      files: [],
      issues: [],
      lastScanTime: Date.now(),
    };

    const suggestions = getTraefikSuggestions(
      '        - ',
      2,
      11,
      ['      middlewares:', '        - '],
      mockIndex
    );

    assert.ok(suggestions.length >= 2);
    // Exact file name (without @file) should be top choice
    assert.equal(suggestions[0].label, 'mw-security-headers');
    assert.equal(suggestions[0].insertText, 'mw-security-headers');
    assert.ok(suggestions[0].sortText.startsWith('0_'));

    // @file variant should be secondary choice
    assert.equal(suggestions[1].label, 'mw-security-headers@file');
    assert.equal(suggestions[1].insertText, 'mw-security-headers@file');
    assert.ok(suggestions[1].sortText.startsWith('1_'));
  });

  it('should correctly extract full token from quoted string with @file regardless of hyphen boundaries', () => {
    // User's exact case from screenshot: cursor on 'headers'
    const line = '    - "mw-security-headers@file"';
    const colOnHeaders = 22; // on 'headers'
    const token = extractTokenAtPosition(line, colOnHeaders);

    assert.ok(token);
    assert.equal(token.rawToken, 'mw-security-headers@file');
    assert.equal(token.cleanRef, 'mw-security-headers');
  });

  it('should correctly extract unquoted token with hyphens', () => {
    const line = '    - mw-security-headers';
    const colOnSecurity = 14; // on 'security'
    const token = extractTokenAtPosition(line, colOnSecurity);

    assert.ok(token);
    assert.equal(token.rawToken, 'mw-security-headers');
    assert.equal(token.cleanRef, 'mw-security-headers');
  });

  it('should correctly extract service token in service: line', () => {
    const line = '      service: pcshare-service';
    const col = 18;
    const token = extractTokenAtPosition(line, col);

    assert.ok(token);
    assert.equal(token.cleanRef, 'pcshare-service');
  });
});
