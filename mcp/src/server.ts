/**
 * Tier-2 MCP server for repo-orchestrator.
 * Exposes registry.json as live MCP tools so the master can query context at scale.
 * Optional — Tier 0/1 work without this server.
 *
 * Tools: list_repos, get_repo_context, update_repo_context, register_agent, find_owning_repos
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { RepoEntrySchema, formatZodError, type Registry, type RepoEntry } from './registry.js';
import { isReadOnlyMode, toolAllowed } from './policy.js';

const READ_ONLY = isReadOnlyMode();

// ── Registry helpers ─────────────────────────────────────────────────────────

const REGISTRY_PATH = join(process.cwd(), '.repo-orchestrator', 'registry.json');

function loadRegistry(): Record<string, unknown> {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`Registry not found at ${REGISTRY_PATH}. Run /init-context first.`);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Record<string, unknown>;
}

function saveRegistry(registry: Record<string, unknown>): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const tools = [
  {
    name: 'list_repos',
    description: 'List all repos registered in the workspace registry.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_repo_context',
    description: 'Get the full registry entry for a named repo.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Repo name, e.g. "auth-service"' } },
      required: ['name'],
    },
  },
  {
    name: 'update_repo_context',
    description: 'Patch the registry entry for a named repo. Only the provided fields are updated.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        patch: { type: 'object', description: 'Key-value pairs to merge into the repo entry.' },
      },
      required: ['name', 'patch'],
    },
  },
  {
    name: 'register_agent',
    description: 'Add or replace a repo entry in the registry.',
    inputSchema: {
      type: 'object',
      properties: {
        entry: { type: 'object', description: 'Full repo registry entry conforming to registry.schema.json.' },
      },
      required: ['entry'],
    },
  },
  {
    name: 'find_owning_repos',
    description: 'Given a list of keywords, return repos whose owns/endpoints/emits/consumes fields match.',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' }, description: 'Domain keywords from a ticket.' },
      },
      required: ['keywords'],
    },
  },
];

// ── Tool handlers ────────────────────────────────────────────────────────────

const UpdatePatchSchema = z.object({ name: z.string(), patch: z.record(z.unknown()) });
const RegisterEntrySchema = z.object({ entry: z.record(z.unknown()) });
const FindKeywordsSchema = z.object({ keywords: z.array(z.string()) });
const GetRepoSchema = z.object({ name: z.string() });

// RepoEntry / Registry types and validation come from ./registry (the single
// zod source of truth, kept in parity with schemas/registry.schema.json).

function handleListRepos(): string {
  const registry = loadRegistry() as { repos: RepoEntry[] };
  return JSON.stringify(registry.repos.map(r => ({
    name: r.name, agentType: r.agentType, languages: r.languages, owns: r.owns,
  })), null, 2);
}

function handleGetRepoContext(args: unknown): string {
  const { name } = GetRepoSchema.parse(args);
  const registry = loadRegistry() as { repos: RepoEntry[] };
  const repo = registry.repos.find(r => r.name === name);
  if (!repo) throw new Error(`Repo "${name}" not found in registry.`);
  return JSON.stringify(repo, null, 2);
}

function handleUpdateRepoContext(args: unknown): string {
  const { name, patch } = UpdatePatchSchema.parse(args);
  const registry = loadRegistry() as Registry;
  const idx = registry.repos.findIndex(r => r.name === name);
  if (idx === -1) throw new Error(`Repo "${name}" not found in registry.`);
  // Validate the *merged* entry — a patch must leave the entry schema-valid.
  const merged = { ...registry.repos[idx], ...patch, userEdited: true };
  const parsed = RepoEntrySchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Patch would make repo "${name}" invalid: ${formatZodError(parsed.error)}`);
  }
  registry.repos[idx] = parsed.data;
  saveRegistry(registry);
  return `Updated repo "${name}" in registry.`;
}

function handleRegisterAgent(args: unknown): string {
  const { entry } = RegisterEntrySchema.parse(args);
  // Full schema validation — registry writes must conform to registry.schema.json.
  const parsed = RepoEntrySchema.safeParse(entry);
  if (!parsed.success) {
    throw new Error(`Invalid repo entry: ${formatZodError(parsed.error)}`);
  }
  const repo: RepoEntry = parsed.data;
  const registry = loadRegistry() as Registry;
  const idx = registry.repos.findIndex(r => r.name === repo.name);
  if (idx >= 0) {
    registry.repos[idx] = repo;
  } else {
    registry.repos.push(repo);
  }
  registry.generatedAt = new Date().toISOString();
  saveRegistry(registry);
  return `Registered agent for repo "${repo.name}".`;
}

function handleFindOwningRepos(args: unknown): string {
  const { keywords } = FindKeywordsSchema.parse(args);
  const lower = keywords.map(k => k.toLowerCase());
  const registry = loadRegistry() as { repos: RepoEntry[] };
  const results = registry.repos
    .map(r => {
      let score = 0;
      const fields = [...(r.owns ?? []), ...(r.endpoints ?? []), ...(r.emits ?? []), ...(r.consumes ?? [])].map(s => s.toLowerCase());
      for (const kw of lower) {
        for (const field of fields) {
          if (field === kw) score += 3;
          else if (field.includes(kw)) score += 1;
        }
      }
      return { name: r.name, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return JSON.stringify(results, null, 2);
}

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'repo-orchestrator', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// In read-only mode, write tools are not advertised at all.
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.filter(t => toolAllowed(t.name, READ_ONLY)),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    // Defense in depth: reject write tools in read-only mode even if called directly.
    if (!toolAllowed(name, READ_ONLY)) {
      throw new Error(`Tool "${name}" is disabled in read-only mode (REPO_ORCH_READONLY).`);
    }
    let result: string;
    switch (name) {
      case 'list_repos':           result = handleListRepos(); break;
      case 'get_repo_context':     result = handleGetRepoContext(args); break;
      case 'update_repo_context':  result = handleUpdateRepoContext(args); break;
      case 'register_agent':       result = handleRegisterAgent(args); break;
      case 'find_owning_repos':    result = handleFindOwningRepos(args); break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${String(err)}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
