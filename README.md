# repo-orchestrator

> A Claude Code plugin that turns a multi-repo microservice project into a coordinated team of AI agents that **propose** (never apply) consolidated change plans.

[![Validate Plugin](https://github.com/architonixlabs/RepoOrch/actions/workflows/validate.yml/badge.svg)](https://github.com/architonixlabs/RepoOrch/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](.claude-plugin/plugin.json)

---

## What it does

You have five microservice repos. A ticket arrives: "Users are getting 401 errors after the auth refactor."

Without this plugin you manually figure out which services are affected, read three codebases, and hope you didn't miss a cross-repo contract break.

With this plugin:

1. `/triage "Users getting 401 after auth refactor"` — the master reads your registry, routes to the responsible specialists, and spawns them as an **Agent Team**.
2. Each specialist reads its pre-built knowledge graph first (if available), emits a VERDICT, and deliberates directly with teammates over any cross-repo contracts via the mailbox.
3. You receive a **single, ordered change plan** — with cross-repo dependency ordering, risks, and validation hints.
4. **No files are modified.** You decide what to execute.

---

## Why Agent Teams (not subagents)?

Regular subagents can only report to their caller. **Agent Teams** (Claude Code v2.1.32+) give each teammate its own context window and a **mailbox for direct peer messaging**. This lets the auth specialist ask the payments specialist "your service depends on the JWT `sub` claim — does my proposed change to that claim break you?" without routing through the master. That direct deliberation is what makes the plan trustworthy.

---

## Prerequisites

| Requirement | Detail |
| --- | --- |
| **Claude Code** | v2.1.32 or later |
| **Agent Teams** | Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (see workspace setup) |
| **Node.js 18+** | Optional — only needed for the Tier-1 indexer and MCP server. The core Tier-0 path works without it. |
| **Python 3.10+** | Optional — only needed for graphify knowledge graphs (token-saving feature). |

---

## Install

```bash
# Add the marketplace (one time)
/plugin marketplace add architonixlabs/RepoOrch

# Install the plugin
/plugin install repo-orchestrator@repo-orchestrator-dev
```

---

## Workspace setup

Your workspace should look like this:

```text
my-project/          ← run `claude` here
├── auth-service/    ← a git repo (clone or submodule)
├── payments/
├── notifications/
├── inventory/
└── shipping/
```

All service repos are **immediate subdirectories of the root**. This is the layout the plugin expects by default — no configuration needed.

Enable Agent Teams by copying the example settings file to your workspace root:

```bash
cp .claude/plugins/repo-orchestrator/examples/workspace-template/.claude/settings.json .claude/settings.json
```

Or let `/init-context` create it for you (it will ask).

---

## Usage

### 1 — Bootstrap (once per project)

```text
/init-context
```

What it does:

1. Discovers all git repos under the workspace root
2. Indexes each repo (language, frameworks, endpoints, events, dependencies)
3. Builds knowledge graphs per repo if graphify is installed *(reduces future triage token cost)*
4. Writes an editable context document per repo — **then pauses for your review**
5. You edit the context files (especially `owns` — this drives routing)
6. You confirm → specialist agents and `registry.json` are written

### 2 — Triage a ticket

```text
/triage "Users are getting 401 errors after the recent auth refactor"
```

### 3 — Root-cause an incident (adversarial mode)

```text
/deliberate "Payments failing intermittently — unknown root cause"
```

### 4 — Edit a repo's context

```text
/edit-context auth-service
```

### 5 — Refresh after code changes

```text
/sync-context              # all repos
/sync-context auth-service # one repo
```

### 6 — Build knowledge graphs (token-saving, optional)

```text
/graph-context              # build graphs for all repos
/graph-context auth-service # build graph for one repo
/graph-context --rebuild    # force full rebuild after a major refactor
```

Graphs are stored in `.repo-orchestrator/graphs/<name>/graph.json`. Once built, `/triage` automatically queries them before spawning specialists — each specialist receives a pre-fetched graph summary and reads raw source files only for details not covered by the graph. This can cut per-triage token use significantly on large codebases.

---

## Token-saving architecture

By default each `/triage` call has specialists cold-read source files for every ticket. The graphify integration changes this:

```text
/graph-context  →  builds graph.json per repo (one-time cost)
     ↓
/triage         →  master pre-queries each candidate's graph (1200-token budget)
     ↓
specialist      →  reads GRAPH_SUMMARY first, targeted file reads only for gaps
```

**When to run `/graph-context`:**

- After `/init-context` (if it didn't auto-build)
- After a major refactor (`--rebuild`)
- `/sync-context` handles incremental updates automatically when code drift is detected

**Requires:** Python 3.10+ and `pip install graphifyy`. If graphify is not installed, the plugin degrades gracefully to direct file reads at every step.

---

## The propose-only safety model

Every specialist agent has:

- `tools: Read, Grep, Glob, Bash` — Bash is inspection-only by instruction
- No write, edit, create, or delete tools
- Hard rule: "Never modify a file. Never commit, push, or open a PR."
- Optional: add a project-scoped `PreToolUse` hook to hard-block write-like Bash commands (see `agents/repo-specialist-template.md`)

The `/triage` and `/deliberate` commands spawn agents with `permissionMode: "plan"` (read + delegate only).

**v0.2 guarantee:** the agents produce a plan document. The developer executes it.

---

## Cost notes

Routing caps the Agent Team at **3–5 repos** by default. Single-repo tickets skip the team entirely and use one subagent. For large workspaces (8+ repos), `/deliberate` will warn before spawning all specialists.

The `/graph-context` integration is the primary lever for reducing ongoing token cost — build the graphs once, benefit on every triage.

---

## Optional tiers

| Tier | What it adds | Requirement |
| --- | --- | --- |
| **Tier 0** | All core functionality via prompt-driven skills | None |
| **Tier 1 — Indexer** | Faster, deterministic extraction | Node.js 18+ |
| **Tier 2 — MCP server** | Live registry tools for the master agent | Node.js 18+ |
| **graphify graphs** | Pre-built knowledge graphs that cut triage token cost | Python 3.10+ |

### Build Tier-1 indexer

```bash
cd indexer && npm install && npm run build
```

### Build Tier-2 MCP server

```bash
cd mcp && npm install && npm run build
```

Then add the MCP server to your workspace `.claude/settings.json`:

```json
{
  "mcpServers": {
    "repo-orchestrator": {
      "command": "node",
      "args": [".claude/plugins/repo-orchestrator/mcp/dist/server.js"]
    }
  }
}
```

### Install graphify

```bash
pip install graphifyy
# or, if you use uv:
uv tool install graphifyy
```

Then run `/graph-context` to build the graphs. No other configuration needed.

---

## Headless / CI usage (Agent SDK)

`automation/triage_runner.mjs` exposes `runTriage()` for webhook handlers:

```javascript
import { runTriage } from '.claude/plugins/repo-orchestrator/automation/triage_runner.mjs';

// In a GitHub/Jira webhook handler:
const plan = await runTriage({
  ticket: issue.body,
  workspaceRoot: '/path/to/your/workspace',
});
await postComment(issue.number, plan);
```

Requires `@anthropic-ai/claude-agent-sdk` (`npm install @anthropic-ai/claude-agent-sdk`). Runs in `permissionMode: "plan"` — read-only, propose-only.

---

## Project layout

```text
repo-orchestrator/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/
│   ├── repo-indexing/SKILL.md      Tier-0 indexing instructions
│   └── routing/SKILL.md            Keyword scoring + candidate selection
├── agents/
│   └── repo-specialist-template.md Per-repo specialist (graph-first startup)
├── commands/
│   ├── init-context.md             Bootstrap: discover → index → graph → pause → register
│   ├── sync-context.md             Drift detection + incremental graph update
│   ├── edit-context.md             Guided context editing
│   ├── graph-context.md            Build/refresh graphify knowledge graphs
│   ├── triage.md                   Master controller (graph pre-query + agent team)
│   └── deliberate.md               Adversarial root-cause mode
├── hooks/hooks.json                SessionStart registry check
├── schemas/
│   ├── registry.schema.json        JSON Schema for registry.json
│   └── context-template.md         Per-repo context file template
├── indexer/                        Tier 1 — optional TypeScript indexer
├── mcp/                            Tier 2 — optional MCP server
├── automation/                     Agent SDK headless runner
│   ├── triage_runner.mjs
│   └── package.json
├── examples/
│   └── workspace-template/.claude/settings.json
├── LICENSE
├── CONTRIBUTING.md
└── README.md
```

---

## Generated workspace artifacts

The plugin generates these files **in your workspace** (not in the plugin directory):

```text
your-workspace/
├── .repo-orchestrator/
│   ├── registry.json               Master index of all repos
│   ├── config.json                 Discovery settings
│   ├── context/
│   │   ├── auth-service.md         Editable context per repo
│   │   └── payments.md
│   └── graphs/
│       ├── auth-service/
│       │   └── graph.json          Knowledge graph (built by /graph-context)
│       └── payments/
│           └── graph.json
└── .claude/
    ├── agents/
    │   ├── repo-auth-service.md    Generated specialist agent
    │   └── repo-payments.md
    └── settings.json               Agent Teams env var
```

---

## Changelog

### v0.2.0

- **graphify integration** — `/graph-context` command builds per-repo knowledge graphs; `/triage` pre-queries them before spawning specialists; `/sync-context` incrementally updates graphs on drift; specialists read graph summary first and use targeted file reads only for gaps
- Specialist template updated to consume `GRAPH_SUMMARY` from master context
- Graceful degradation at every step when graphify is not installed

### v0.1.0

- Initial release: Tier-0 commands, routing skill, specialist template, Tier-1 indexer, Tier-2 MCP server, Agent SDK automation runner

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — Architonix
