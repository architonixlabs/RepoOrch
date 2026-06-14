/**
 * Path-containment guards for the indexer.
 *
 * The indexer globs and reads files from an arbitrary repo. Without these
 * guards a symlink inside the repo (or a `..` in a computed path) lets reads
 * escape the repo root and pull in files from elsewhere on disk. Every file
 * read in the indexer must go through `safeReadFile` / `resolveWithinRoot`.
 */

import { readFileSync, realpathSync } from 'fs';
import { resolve, relative, isAbsolute } from 'path';

/** True iff `candidateReal` is the root itself or nested beneath it. */
export function isWithinRoot(rootReal: string, candidateReal: string): boolean {
  const rel = relative(rootReal, candidateReal);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** realpathSync that returns null instead of throwing on missing/broken paths. */
export function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * Resolve `relFile` against `repoRoot`, following symlinks, and return the real
 * absolute path ONLY if it stays within the repo root. Returns null if the path
 * is missing, unresolvable, or escapes the root (symlink or `..`).
 */
export function resolveWithinRoot(repoRoot: string, relFile: string): string | null {
  const rootReal = safeRealpath(repoRoot);
  if (!rootReal) return null;
  const candidateReal = safeRealpath(resolve(rootReal, relFile));
  if (!candidateReal) return null;
  return isWithinRoot(rootReal, candidateReal) ? candidateReal : null;
}

/** Read a repo file as UTF-8, or null if it's unreadable or escapes the root. */
export function safeReadFile(repoRoot: string, relFile: string): string | null {
  const safe = resolveWithinRoot(repoRoot, relFile);
  if (!safe) return null;
  try {
    return readFileSync(safe, 'utf8');
  } catch {
    return null;
  }
}
