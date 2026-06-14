/**
 * Tests for the triage runner's SDK-free guards (validate.mjs).
 * These run without importing the Agent SDK.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNonEmpty, assertRegistry } from '../validate.mjs';

describe('assertNonEmpty', () => {
  test('throws on empty / blank / undefined', () => {
    expect(() => assertNonEmpty('runTriage: ticket', '')).toThrow(/non-empty/);
    expect(() => assertNonEmpty('runTriage: ticket', '   ')).toThrow(/non-empty/);
    expect(() => assertNonEmpty('runDeliberate: incident', undefined)).toThrow(/non-empty/);
  });
  test('the error names the field', () => {
    expect(() => assertNonEmpty('runTriage: ticket', '')).toThrow('runTriage: ticket must be a non-empty string.');
  });
  test('passes for a real value', () => {
    expect(() => assertNonEmpty('runTriage: ticket', 'Users get 401')).not.toThrow();
  });
});

describe('assertRegistry', () => {
  test('throws when the workspace has no registry', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ro-auto-'));
    expect(() => assertRegistry(cwd)).toThrow(/Registry not found/);
  });
});
