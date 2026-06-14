/**
 * Tests for the indexer path-containment guards (src/paths.ts).
 *
 * Temp dirs and symlinks are created at runtime (no committed fixtures), so
 * line-ending/path-separator normalization isn't a factor here.
 */

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isWithinRoot, resolveWithinRoot, safeReadFile } from '../src/paths.js';

describe('isWithinRoot (pure)', () => {
  test('root itself is within root', () => {
    expect(isWithinRoot('/repo', '/repo')).toBe(true);
  });
  test('nested path is within root', () => {
    expect(isWithinRoot('/repo', '/repo/src/index.ts')).toBe(true);
  });
  test('sibling/escape path is rejected', () => {
    expect(isWithinRoot('/repo', '/etc/passwd')).toBe(false);
    expect(isWithinRoot('/repo', '/repo-evil/secret')).toBe(false);
  });
});

describe('resolveWithinRoot / safeReadFile (real fs)', () => {
  let root: string;
  let outside: string;

  beforeAll(() => {
    const base = mkdtempSync(join(tmpdir(), 'repoorch-paths-'));
    root = join(base, 'repo');
    outside = join(base, 'outside');
    mkdirSync(join(root, 'sub'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(root, 'sub', 'inside.txt'), 'INSIDE');
    writeFileSync(join(outside, 'secret.txt'), 'SECRET');
  });

  test('resolves a file genuinely inside the root', () => {
    expect(resolveWithinRoot(root, 'sub/inside.txt')).not.toBeNull();
    expect(safeReadFile(root, 'sub/inside.txt')).toBe('INSIDE');
  });

  test('rejects a `..` traversal that escapes the root', () => {
    expect(resolveWithinRoot(root, '../outside/secret.txt')).toBeNull();
    expect(safeReadFile(root, '../outside/secret.txt')).toBeNull();
  });

  test('returns null for a missing file', () => {
    expect(resolveWithinRoot(root, 'sub/nope.txt')).toBeNull();
    expect(safeReadFile(root, 'sub/nope.txt')).toBeNull();
  });

  test('rejects a symlink pointing outside the root', () => {
    const link = join(root, 'leak.txt');
    let symlinksSupported = true;
    try {
      symlinkSync(join(outside, 'secret.txt'), link);
    } catch {
      symlinksSupported = false; // Windows without privilege — skip the assertion
    }
    if (!symlinksSupported) return;
    // The symlink lives inside the root but resolves outside → must be rejected.
    expect(resolveWithinRoot(root, 'leak.txt')).toBeNull();
    expect(safeReadFile(root, 'leak.txt')).toBeNull();
    rmSync(link, { force: true });
  });
});
