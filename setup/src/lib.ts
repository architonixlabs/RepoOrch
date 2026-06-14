/**
 * Pure, side-effect-free helpers for the setup runner.
 *
 * Extracted from index.ts so they can be unit-tested without executing the
 * runner's top-level install flow (index.ts runs on import).
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * Compare two semver strings: is `ver` >= `min`?
 * Assumes well-formed three-part `X.Y.Z` versions (the version-extraction
 * regex in index.ts guarantees this for the values passed here).
 */
export function semverGte(ver: string, min: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [ma, mi, pa] = parse(ver);
  const [mb, mib, pb] = parse(min);
  if (ma !== mb) return ma > mb;
  if (mi !== mib) return mi > mib;
  return pa >= pb;
}

/** Absolute path to the installed plugin within a workspace. */
export function pluginPath(workspace: string): string {
  return join(workspace, '.claude', 'plugins', 'repo-orchestrator');
}

/** Forward-slash relative path to the built MCP server (portable in settings.json). */
export const MCP_SERVER_REL_PATH = '.claude/plugins/repo-orchestrator/mcp/dist/server.js';

/**
 * Return a copy of `settings` with the repo-orchestrator MCP server wired in,
 * preserving any existing keys and other mcpServers entries. Pure — does no I/O.
 * This removes the manual `.claude/settings.json` edit the README used to require.
 */
export function withMcpServer(
  settings: Record<string, unknown>,
  serverPath: string = MCP_SERVER_REL_PATH,
): Record<string, unknown> {
  const servers = (settings['mcpServers'] as Record<string, unknown> | undefined) ?? {};
  return {
    ...settings,
    mcpServers: {
      ...servers,
      'repo-orchestrator': { command: 'node', args: [serverPath] },
    },
  };
}

/** True if `settings` already has the repo-orchestrator MCP server wired in. */
export function hasMcpServer(settings: Record<string, unknown>): boolean {
  const servers = settings['mcpServers'] as Record<string, unknown> | undefined;
  return Boolean(servers && servers['repo-orchestrator']);
}

export interface HealthCheck { label: string; ok: boolean; detail: string; }
export interface HealthReport { ok: boolean; checks: HealthCheck[]; }

/**
 * Deterministic, no-LLM readiness check for a bootstrapped workspace. Reads
 * (never writes) the registry and verifies each repo has its context + agent
 * file. Used by the setup runner's `--verify` mode and is safe to run anytime.
 */
export function checkWorkspaceHealth(cwd: string): HealthReport {
  const checks: HealthCheck[] = [];
  const regPath = join(cwd, '.repo-orchestrator', 'registry.json');

  if (!existsSync(regPath)) {
    checks.push({ label: 'registry.json', ok: false, detail: 'not found — run /repo-orch-init' });
    return { ok: false, checks };
  }

  let registry: { repos?: Array<{ name?: unknown }> };
  try {
    registry = JSON.parse(readFileSync(regPath, 'utf8'));
  } catch {
    checks.push({ label: 'registry.json', ok: false, detail: 'present but not valid JSON' });
    return { ok: false, checks };
  }

  const repos = Array.isArray(registry.repos) ? registry.repos : [];
  checks.push({
    label: 'registry.json',
    ok: repos.length > 0,
    detail: repos.length > 0 ? `${repos.length} repo(s) registered` : 'no repos registered',
  });

  for (const r of repos) {
    const name = typeof r.name === 'string' ? r.name : '(unnamed)';
    const ctx = existsSync(join(cwd, '.repo-orchestrator', 'context', `${name}.md`));
    const agent = existsSync(join(cwd, '.claude', 'agents', `repo-${name}.md`));
    checks.push({
      label: `repo ${name}`,
      ok: ctx && agent,
      detail: `${ctx ? '✓' : '✗'} context   ${agent ? '✓' : '✗'} agent`,
    });
  }

  return { ok: checks.every((c) => c.ok), checks };
}
