/**
 * Tests for the MCP read-only tool policy (src/policy.ts).
 */

import {
  isReadOnlyMode,
  isWriteTool,
  toolAllowed,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
} from '../src/policy.js';

describe('isReadOnlyMode', () => {
  test('on for "1" and "true"', () => {
    expect(isReadOnlyMode({ REPO_ORCH_READONLY: '1' })).toBe(true);
    expect(isReadOnlyMode({ REPO_ORCH_READONLY: 'true' })).toBe(true);
  });
  test('off when unset or other values', () => {
    expect(isReadOnlyMode({})).toBe(false);
    expect(isReadOnlyMode({ REPO_ORCH_READONLY: '0' })).toBe(false);
    expect(isReadOnlyMode({ REPO_ORCH_READONLY: 'false' })).toBe(false);
  });
});

describe('tool classification', () => {
  test('write tools are the two mutating handlers', () => {
    expect([...WRITE_TOOLS].sort()).toEqual(['register_agent', 'update_repo_context']);
    for (const t of WRITE_TOOLS) expect(isWriteTool(t)).toBe(true);
    for (const t of READ_ONLY_TOOLS) expect(isWriteTool(t)).toBe(false);
  });
});

describe('toolAllowed', () => {
  test('read mode: read tools allowed, write tools blocked', () => {
    expect(toolAllowed('list_repos', true)).toBe(true);
    expect(toolAllowed('get_repo_context', true)).toBe(true);
    expect(toolAllowed('find_owning_repos', true)).toBe(true);
    expect(toolAllowed('register_agent', true)).toBe(false);
    expect(toolAllowed('update_repo_context', true)).toBe(false);
  });
  test('write mode: everything allowed', () => {
    for (const t of [...READ_ONLY_TOOLS, ...WRITE_TOOLS]) {
      expect(toolAllowed(t, false)).toBe(true);
    }
  });
});
