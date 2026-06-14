/**
 * Tests for the setup runner's pure helpers (src/lib.ts).
 */

import { semverGte, pluginPath, withMcpServer, hasMcpServer, MCP_SERVER_REL_PATH } from '../src/lib.js';
import { join } from 'node:path';

describe('semverGte', () => {
  test('equal versions are >=', () => {
    expect(semverGte('2.1.32', '2.1.32')).toBe(true);
  });
  test('greater patch / minor / major', () => {
    expect(semverGte('2.1.33', '2.1.32')).toBe(true);
    expect(semverGte('2.2.0', '2.1.99')).toBe(true);
    expect(semverGte('3.0.0', '2.9.9')).toBe(true);
  });
  test('lower patch / minor / major', () => {
    expect(semverGte('2.1.31', '2.1.32')).toBe(false);
    expect(semverGte('2.0.99', '2.1.0')).toBe(false);
    expect(semverGte('1.9.9', '2.0.0')).toBe(false);
  });
  test('the real gate it guards (Claude Code 2.1.32+, Node 18+)', () => {
    expect(semverGte('2.1.32', '2.1.32')).toBe(true); // exactly the floor passes
    expect(semverGte('2.1.31', '2.1.32')).toBe(false);
    expect(semverGte('20.11.0', '18.0.0')).toBe(true);
    expect(semverGte('16.20.0', '18.0.0')).toBe(false);
  });
});

describe('pluginPath', () => {
  test('joins the standard plugin location under a workspace', () => {
    expect(pluginPath('/ws')).toBe(join('/ws', '.claude', 'plugins', 'repo-orchestrator'));
  });
});

describe('withMcpServer / hasMcpServer', () => {
  test('adds the MCP server to empty settings', () => {
    const out = withMcpServer({});
    expect(out).toEqual({
      mcpServers: { 'repo-orchestrator': { command: 'node', args: [MCP_SERVER_REL_PATH] } },
    });
    expect(hasMcpServer(out)).toBe(true);
  });
  test('preserves existing keys and other mcpServers entries', () => {
    const out = withMcpServer({
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
      mcpServers: { other: { command: 'x', args: [] } },
    });
    expect(out.env).toEqual({ CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' });
    expect((out.mcpServers as Record<string, unknown>).other).toEqual({ command: 'x', args: [] });
    expect((out.mcpServers as Record<string, unknown>)['repo-orchestrator']).toBeDefined();
  });
  test('hasMcpServer is false when absent', () => {
    expect(hasMcpServer({})).toBe(false);
    expect(hasMcpServer({ mcpServers: {} })).toBe(false);
  });
  test('is idempotent — re-applying changes nothing', () => {
    const once = withMcpServer({});
    expect(withMcpServer(once)).toEqual(once);
  });
});
