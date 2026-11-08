import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCompletionRangeAndText,
  getYamlContext,
  getTraefikSuggestions,
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

  it('should prioritize bare unquoted names first, then @file variant', () => {
    const mockIndex: TraefikIndex = {
      middlewares: new Map([
        [
          'local-only',
          {
            id: 'local-only',
            name: 'local-only',
            file: 'rules/mw-security.yml',
            line: 3,
            type: 'ipAllowList',
            summary: 'sourceRange: 192.168.1.0/24',
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
    // Bare unquoted name should be first
    assert.equal(suggestions[0].label, 'local-only');
    assert.equal(suggestions[0].insertText, 'local-only');
    assert.ok(suggestions[0].sortText.startsWith('0_'));

    // @file variant should be second
    assert.equal(suggestions[1].label, 'local-only@file');
    assert.equal(suggestions[1].insertText, 'local-only@file');
    assert.ok(suggestions[1].sortText.startsWith('1_'));
  });
});
