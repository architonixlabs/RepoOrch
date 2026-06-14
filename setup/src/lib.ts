/**
 * Pure, side-effect-free helpers for the setup runner.
 *
 * Extracted from index.ts so they can be unit-tested without executing the
 * runner's top-level install flow (index.ts runs on import).
 */

import { join } from 'path';

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
