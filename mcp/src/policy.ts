/**
 * MCP tool read-only policy.
 *
 * The orchestrator's safety model assumes tools are read-only — but the MCP
 * server exposes two write tools (`update_repo_context`, `register_agent`).
 * `permissionMode: 'plan'` does NOT gate MCP tool side effects, so a plan-mode
 * /triage context could still call them. When `REPO_ORCH_READONLY` is set, the
 * server advertises and serves ONLY the read tools and rejects the write tools.
 *
 * Setup/sync contexts (which legitimately write) simply leave the env unset.
 */

export const READ_ONLY_TOOLS = ['list_repos', 'get_repo_context', 'find_owning_repos'] as const;
export const WRITE_TOOLS = ['update_repo_context', 'register_agent'] as const;

/** True when the server should run in read-only mode (writes disabled). */
export function isReadOnlyMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.REPO_ORCH_READONLY;
  return v === '1' || v === 'true';
}

/** True if the named tool mutates registry state. */
export function isWriteTool(name: string): boolean {
  return (WRITE_TOOLS as readonly string[]).includes(name);
}

/** Whether a tool may be advertised/called given the current read-only mode. */
export function toolAllowed(name: string, readOnly: boolean): boolean {
  return !(readOnly && isWriteTool(name));
}
