/**
 * automation/validate.mjs
 *
 * SDK-free input/registry guards for the triage runner. Extracted so they can
 * be unit-tested without importing @anthropic-ai/claude-agent-sdk (the SDK is a
 * heavy dependency and the runner module pulls it in at import time).
 */

import { resolve } from 'path';
import { readFileSync } from 'fs';

/** Throw if `value` is missing or blank. `label` names the field in the error. */
export function assertNonEmpty(label, value) {
  if (!value || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

/**
 * Throw if the workspace has no registry. Returns the resolved registry path.
 * Mirrors the message the runner surfaced before this was extracted.
 */
export function assertRegistry(cwd) {
  const registryPath = resolve(cwd, '.repo-orchestrator', 'registry.json');
  try {
    readFileSync(registryPath, 'utf8');
  } catch {
    throw new Error(`Registry not found at ${registryPath}. Run /repo-orch-init in the workspace first.`);
  }
  return registryPath;
}
