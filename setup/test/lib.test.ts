/**
 * Tests for the setup runner's pure helpers (src/lib.ts).
 */

import { semverGte, pluginPath, withMcpServer, hasMcpServer, MCP_SERVER_REL_PATH, checkWorkspaceHealth } from '../src/lib.js';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

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

describe('checkWorkspaceHealth', () => {
  const mkWorkspace = () => mkdtempSync(join(tmpdir(), 'ro-health-'));

  test('fails when no registry exists', () => {
    const r = checkWorkspaceHealth(mkWorkspace());
    expect(r.ok).toBe(false);
    expect(r.checks[0].detail).toMatch(/not found/);
  });

  test('fails on invalid registry JSON', () => {
    const ws = mkWorkspace();
    mkdirSync(join(ws, '.repo-orchestrator'), { recursive: true });
    writeFileSync(join(ws, '.repo-orchestrator', 'registry.json'), '{ not json');
    const r = checkWorkspaceHealth(ws);
    expect(r.ok).toBe(false);
    expect(r.checks[0].detail).toMatch(/not valid JSON/);
  });

  test('passes when registry + context + agent files all exist', () => {
    const ws = mkWorkspace();
    mkdirSync(join(ws, '.repo-orchestrator', 'context'), { recursive: true });
    mkdirSync(join(ws, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(ws, '.repo-orchestrator', 'registry.json'), JSON.stringify({ repos: [{ name: 'auth-service' }] }));
    writeFileSync(join(ws, '.repo-orchestrator', 'context', 'auth-service.md'), '#');
    writeFileSync(join(ws, '.claude', 'agents', 'repo-auth-service.md'), '#');
    const r = checkWorkspaceHealth(ws);
    expect(r.ok).toBe(true);
  });

  test('flags a repo missing its agent file', () => {
    const ws = mkWorkspace();
    mkdirSync(join(ws, '.repo-orchestrator', 'context'), { recursive: true });
    writeFileSync(join(ws, '.repo-orchestrator', 'registry.json'), JSON.stringify({ repos: [{ name: 'payments' }] }));
    writeFileSync(join(ws, '.repo-orchestrator', 'context', 'payments.md'), '#');
    const r = checkWorkspaceHealth(ws);
    expect(r.ok).toBe(false);
    const repoCheck = r.checks.find(c => c.label.includes('payments'));
    expect(repoCheck?.detail).toMatch(/✗ agent/);
  });
});
