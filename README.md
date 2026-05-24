# repo-orchestrator

> A Claude Code plugin that turns a multi-repo microservice project into a coordinated team of AI agents that **propose** (never apply) consolidated change plans.

[![Validate Plugin](https://github.com/architonixlabs/RepoOrch/actions/workflows/validate.yml/badge.svg?branch=main)](https://github.com/architonixlabs/RepoOrch/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.6-blue.svg)](.claude-plugin/plugin.json)

---

## What it does

You have five microservice repos. A ticket arrives: "Users are getting 401 errors after the auth refactor."

Without this plugin you manually figure out which services are affected, read three codebases, and hope you didn't miss a cross-repo contract break.

With this plugin:

1. `/repo-orch-triage "Users getting 401 after auth refactor"` — the master reads your registry, routes to the responsible specialists, and spawns them as an **Agent Team**.
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
/plugin install repo-orchestrator@repo-orchestrator
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

---

## Usage

### 1 — Interactive setup (recommended first-time path)

```text
/repo-orch-setup
```

An interactive wizard that:

1. Checks all prerequisites (Claude Code version, Node.js, Python, graphify)
2. Shows a pass/fail table — required items block progress, optional items are offered as installs
3. Offers to enable Agent Teams, install graphify, and build the Tier-1/2 components
4. Prints a readiness summary, then hands off to `/repo-orch-init` automatically

**Prerequisite checks:**

| Check | Required | What it verifies |
| --- | --- | --- |
| Claude Code ≥ 2.1.32 | Yes | Agent Teams support |
| Workspace layout | Yes | At least one git repo as an immediate subdirectory |
| Node.js ≥ 18 | No | Tier-1 indexer + Tier-2 MCP server |
| Python ≥ 3.10 | No | graphify knowledge graphs |
| graphify | No | Pre-built graphs for token savings |
| Agent Teams env var | No | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |

### 2 — Bootstrap only (skip the wizard)

```text
/repo-orch-init
```

What it does:

1. Discovers all git repos under the workspace root
2. Indexes each repo (language, frameworks, endpoints, events, dependencies)
3. Builds knowledge graphs per repo if graphify is installed *(reduces future triage token cost)*
4. Writes an editable context document per repo — **then pauses for your review**
5. You edit the context files (especially `owns` — this drives routing)
6. You confirm → specialist agents and `registry.json` are written

### 3 — Triage a ticket

```text
/repo-orch-triage "Users are getting 401 errors after the recent auth refactor"
```

### 4 — Root-cause an incident (adversarial mode)

```text
/repo-orch-deliberate "Payments failing intermittently — unknown root cause"
```

### 5 — Edit a repo's context

```text
/repo-orch-edit auth-service
```

### 6 — Refresh after code changes

```text
/repo-orch-sync              # all repos
/repo-orch-sync auth-service # one repo
```

### 7 — Build knowledge graphs (token-saving, optional)

```text
/repo-orch-graph              # build graphs for all repos
/repo-orch-graph auth-service # build graph for one repo
/repo-orch-graph --rebuild    # force full rebuild after a major refactor
```

Graphs are stored in `.repo-orchestrator/graphs/<name>/graph.json`. Once built, `/repo-orch-triage` automatically queries them before spawning specialists — each specialist receives a pre-fetched graph summary and reads raw source files only for details not covered by the graph. This can cut per-triage token use significantly on large codebases.

---

## Token-saving architecture

By default each `/repo-orch-triage` call has specialists cold-read source files for every ticket. The graphify integration changes this:

```text
/repo-orch-graph  →  builds graph.json per repo (one-time cost)
     ↓
/repo-orch-triage         →  master pre-queries each candidate's graph (1200-token budget)
     ↓
specialist      →  reads GRAPH_SUMMARY first, targeted file reads only for gaps
```

**When to run `/repo-orch-graph`:**

- After `/repo-orch-init` (if it didn't auto-build)
- After a major refactor (`--rebuild`)
- `/repo-orch-sync` handles incremental updates automatically when code drift is detected

**Requires:** Python 3.10+ and `pip install graphifyy`. If graphify is not installed, the plugin degrades gracefully to direct file reads at every step.

---

## The propose-only safety model

Every specialist agent has:

- `tools: Read, Grep, Glob, Bash` — Bash is inspection-only by instruction
- No write, edit, create, or delete tools
- Hard rule: "Never modify a file. Never commit, push, or open a PR."
- Optional: add a project-scoped `PreToolUse` hook to hard-block write-like Bash commands (see `agents/repo-specialist-template.md`)

The `/repo-orch-triage` and `/repo-orch-deliberate` commands spawn agents with `permissionMode: "plan"` (read + delegate only).

**v0.2 guarantee:** the agents produce a plan document. The developer executes it.

---

## Cost notes

Routing caps the Agent Team at **3–5 repos** by default. Single-repo tickets skip the team entirely and use one subagent. For large workspaces (8+ repos), `/repo-orch-deliberate` will warn before spawning all specialists.

The `/repo-orch-graph` integration is the primary lever for reducing ongoing token cost — build the graphs once, benefit on every triage.

---

## Optional tiers

| Tier | What it adds | Requirement |
| --- | --- | --- |
| **Tier 0** | All core functionality via prompt-driven skills | None |
| **Setup runner** | Rich `listr2` UI for `/repo-orch-setup` (progress steps, spinners, color) | Node.js 18+ |
| **Tier 1 — Indexer** | Faster, deterministic extraction | Node.js 18+ |
| **Tier 2 — MCP server** | Live registry tools for the master agent | Node.js 18+ |
| **graphify graphs** | Pre-built knowledge graphs that cut triage token cost | Python 3.10+ |

### Build setup runner (rich UI)

```bash
cd setup && npm install && npm run build
```

The compiled runner is invoked automatically by `/repo-orch-setup` when it is present at `.claude/plugins/repo-orchestrator/setup/dist/index.js`. It uses `listr2` for live task-list progress and `chalk` for color output. Without it, the command falls back to plain text.

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

Then run `/repo-orch-graph` to build the graphs. No other configuration needed.

---

## Headless / CI usage (Agent SDK)

`automation/repo-orch-triage_runner.mjs` exposes `runTriage()` for webhook handlers:

```javascript
import { runTriage } from '.claude/plugins/repo-orchestrator/automation/repo-orch-triage_runner.mjs';

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
│   ├── setup.md                    Interactive installer + prerequisite checker
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
├── setup/                          Setup runner — listr2 UI for /repo-orch-setup
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
│       │   └── graph.json          Knowledge graph (built by /repo-orch-graph)
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

### v0.2.6

- **Startup tier distinction** — specialists now choose between a Tier A (quick: frontmatter-only, fast) and Tier B (deep: full graph + skill + CLAUDE.md warmup) startup based on query complexity. Simple code-navigation questions no longer incur full warmup cost
- **Agent description fix** — specialist `description` fields now encode invocation intent (architecture, impact analysis, code navigation, failure modes, incident triage) instead of raw noun lists, so Claude Code's routing layer makes better agent-selection decisions
- **Mailbox addressing fixed** — ROUTING CONTEXT block now includes `agent: repo-<name>` alongside repo name, and deliberation instructions explicitly say to use the agent name as the mailbox address; eliminates failed mailbox sends
- **Score normalization fix** — changed formula from `/ (owns.length + 1)` to `/ max(1, owns.length - 1)` so a single exact `owns` match always beats a partial match on a keyword-rich repo; prevents under-selection of focused single-domain services
- **Deliberation ceiling → actionable steps** — unresolved risks after 2 deliberation rounds now produce a concrete manual verification step ("before executing Step N, verify in `<file>` that `<specific thing>`") instead of an open `[UNRESOLVED]` question mark
- **Lens 7 unconditional** — architectural impact lens now runs for every RESPONSIBLE verdict in triage mode, not only when an architect asks; surfaces layering violations, SLO risks, and coupling points on every analysis
- **Per-repo skill file enrichment notice** — `/repo-orch-init` PAUSE message now explicitly tells users which sections are auto-detected vs. which require human knowledge (gotchas, banned patterns); directs users to enrich before first triage
- **GraphQL / gRPC / WebSocket detection** — indexing skill now detects GraphQL resolvers (`type Query/Mutation`), gRPC methods (`.proto` `rpc` declarations), and WebSocket events (`socket.on`, `@SubscribeMessage`); produces typed endpoint entries instead of silent empty arrays
- **SessionStart hook scope guard** — hook now only fires when the current directory looks like a repo-orchestrator workspace (has at least one immediate subdirectory with `.git`); no longer prints in unrelated projects or the plugin repo itself
- **Automation runner fixes** — command updated to `/repo-orch-triage` (was `/triage`); model updated to `claude-opus-4-7`; error messages reference `/repo-orch-init`; `runDeliberate()` export added for webhook handlers that need adversarial root-cause analysis

### v0.2.5

- **Named specialist agents** — each generated agent now has a friendly display name (e.g., `Auth Service Specialist`, `Payments Specialist`) so developers, architects, and designers can call them directly by name for architecture questions, impact analysis, code navigation, and pre-change reviews — no triage required
- **Per-repo skill files** — `/repo-orch-init` generates `.repo-orchestrator/skills/<name>.md` per repo: critical file map, known gotchas, conventions, banned patterns, and testing instructions. Specialists read this as their deepest domain knowledge layer before touching source files
- **Richer specialist template** — 7 analysis lenses (added architecture/design lens for architects and designers); current-state baseline field; severity labels on all risks; routing confidence shown per report; deliberation ceiling (max 2 rounds per pair) with evidence standard (file+line required to close a risk)
- **Enriched routing skill** — acronym expansion table (auth/jwt/rbac/k8s/…), synonym expansion table (login→auth/session, 401→jwt/token, …), score normalization to prevent keyword-count inflation, routing confidence signal passed to each specialist
- **Enriched context template and registry schema** — new contract fields: `authContracts`, `errorContracts`, `configContracts`, `dataContracts`, `serviceLevel`, `testContracts`, `owner`, `apiVersion`, `deprecates`; specialists use these fields in contract-change analysis
- **Richer triage output** — aggregate confidence score, current-state baseline section, rollback guidance, confidence advisory for developers
- **Improved deliberate command** — max 3 rounds ceiling, evidence standard enforced, tie-break rule (recency → breadth → co-equal), `[UNRESOLVED — human decision required]` tag
- **Stale command references fixed** — all `/init-context` and `/sync-context` references updated to `/repo-orch-init` and `/repo-orch-sync`

### v0.2.4

- **`/repo-orch-setup` overhaul** — all prerequisite checks now run in a single Bash script (one permission prompt instead of eight); raw command output is fully suppressed; UI replaced with a clean formatted status dashboard (icons, aligned table, section dividers); optional component installs run silently with before/after status lines; confirmation gates removed — setup proceeds automatically after checks pass

### v0.2.3

- **Installation fix** — plugin manifest now passes `claude plugin validate` cleanly and installs via `/plugin install repo-orchestrator@repo-orchestrator`
  - `author` field corrected to object format
  - `hooks/hooks.json` rewritten to use the record format (`{ "hooks": { "SessionStart": [...] } }`) required by the hooks harness
  - Removed unsupported `commands`, `agents`, `skills`, `hooks` fields from `plugin.json` (auto-discovered by convention)
  - Removed unsupported `mcp` field from `plugin.json`
  - Added YAML frontmatter to both skill files (`skills/repo-indexing/SKILL.md`, `skills/routing/SKILL.md`)
- Install command in README corrected to `/plugin install repo-orchestrator@repo-orchestrator`

### v0.2.2

- **Command renaming** — all commands now use the `repo-orch-` prefix for clear identification: `/repo-orch-setup`, `/repo-orch-init`, `/repo-orch-triage`, `/repo-orch-deliberate`, `/repo-orch-sync`, `/repo-orch-edit`, `/repo-orch-graph`
- All internal cross-references between commands updated
- Markdown lint warnings resolved across all command files

### v0.2.1

- **`/repo-orch-setup` command** — interactive installer that checks all prerequisites before bootstrapping
  - Verifies Claude Code ≥ 2.1.32, workspace layout, Node.js ≥ 18, Python ≥ 3.10
  - Detects and reports optional components: graphify, uv, Tier-1 indexer, Tier-2 MCP server
  - Offers to fix missing optional items (install graphify, build tiers, create Agent Teams settings)
  - Prints a readiness summary then hands off to `/repo-orch-init` automatically
- SessionStart hook updated to suggest `/repo-orch-setup` for first-time users
- Automated release workflow now extracts changelog notes per version tag

### v0.2.0

- **graphify integration** — `/repo-orch-graph` command builds per-repo knowledge graphs; `/repo-orch-triage` pre-queries them before spawning specialists; `/repo-orch-sync` incrementally updates graphs on drift; specialists read graph summary first and use targeted file reads only for gaps
- Specialist template updated to consume `GRAPH_SUMMARY` from master context
- Graceful degradation at every step when graphify is not installed

### v0.1.0

- Initial release: Tier-0 commands, routing skill, specialist template, Tier-1 indexer, Tier-2 MCP server, Agent SDK automation runner

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — Architonix
