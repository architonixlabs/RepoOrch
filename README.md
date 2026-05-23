# repo-orchestrator

> A Claude Code plugin that turns a multi-repo microservice project into a coordinated team of AI agents that **propose** (never apply) consolidated change plans.

[![Validate Plugin](https://github.com/Architonix/RepoOrch/actions/workflows/validate.yml/badge.svg)](https://github.com/Architonix/RepoOrch/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What it does

You have five microservice repos. A ticket arrives: "Users are getting 401 errors after the auth refactor."

Without this plugin you have to manually figure out which services are affected, read three codebases, and hope you didn't miss a cross-repo contract break.

With this plugin:

1. `/triage "Users getting 401 after auth refactor"` — the master controller reads your registry, routes to the responsible specialists, and spawns them as an **Agent Team**.
2. Each specialist reads its repo, emits a VERDICT, and deliberates directly with teammates over any cross-repo contracts via the mailbox.
3. You receive a **single, ordered change plan** — with cross-repo dependency ordering, risks, and validation hints.
4. **No files are modified.** You decide what to execute.

---

## Why Agent Teams (not subagents)?

Regular subagents can only report to their caller. **Agent Teams** (Claude Code v2.1.32+) give each teammate its own context window and a **mailbox for direct peer messaging**. This lets the auth specialist ask the payments specialist "your service depends on the JWT `sub` claim — does my proposed change to that claim break you?" without routing through the master. That direct deliberation is what makes the plan trustworthy.

---

## Prerequisites

| Requirement | Detail |
|---|---|
| **Claude Code** | v2.1.32 or later |
| **Agent Teams** | Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (see workspace setup) |
| **Node.js 18+** | Optional — only needed for the Tier-1 indexer and SessionStart hook. The core path works without it. |

---

## Install

```bash
# Add the marketplace (one time)
/plugin marketplace add Architonix/RepoOrch

# Install the plugin
/plugin install repo-orchestrator@repo-orchestrator-dev
```

---

## Workspace setup

Your workspace should look like this:

```
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

### Bootstrap (once per project)

```
/init-context
```

The command:
1. Discovers all git repos under the workspace root
2. Indexes each repo (language, frameworks, endpoints, events, dependencies)
3. Writes an editable context document per repo — **then pauses**
4. You review and edit the context files (especially the `owns` field — this drives routing)
5. You confirm → specialist agents are generated and `registry.json` is written

### Triage a ticket

```
/triage "Users are getting 401 errors after the recent auth refactor"
```

### Root-cause an incident (adversarial mode)

```
/deliberate "Payments failing intermittently — unknown root cause"
```

### Edit a repo's context

```
/edit-context auth-service
```

### Refresh after code changes

```
/sync-context              # all repos
/sync-context auth-service # one repo
```

---

## The propose-only safety model

Every specialist agent has:
- `tools: Read, Grep, Glob, Bash` — but Bash is read-only by instruction
- No write, edit, create, or delete tools
- Hard instruction: "Never modify a file. Never commit, push, or open a PR."
- Optional: add a project-scoped `PreToolUse` hook to hard-block write-like Bash commands (see `agents/repo-specialist-template.md` for details)

The `/triage` and `/deliberate` commands spawn agents with `permissionMode: "plan"` (read + delegate only).

**v1 guarantee:** the agents produce a plan document. The developer executes it.

---

## Cost notes

Routing caps the Agent Team at **3–5 repos** by default. Single-repo tickets skip the team entirely and use a single subagent. For large workspaces (8+ repos), `/deliberate` will warn before spawning all specialists.

---

## Optional tiers

| Tier | What it adds | Requirement |
|---|---|---|
| **Tier 0** | All core functionality via prompt-driven skills | None — works on every Claude Code install |
| **Tier 1 — Indexer** | Faster, deterministic extraction | Node.js 18+ |
| **Tier 2 — MCP server** | Live registry tools for the master | Node.js 18+, built separately |

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

---

## Project layout

```
repo-orchestrator/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/
│   ├── repo-indexing/SKILL.md
│   └── routing/SKILL.md
├── agents/
│   └── repo-specialist-template.md
├── commands/
│   ├── init-context.md
│   ├── sync-context.md
│   ├── edit-context.md
│   ├── triage.md
│   └── deliberate.md
├── hooks/hooks.json
├── schemas/
│   ├── registry.schema.json
│   └── context-template.md
├── indexer/          (Tier 1 — optional)
├── mcp/              (Tier 2 — optional)
├── automation/       (Agent SDK headless runner)
├── examples/
│   └── workspace-template/.claude/settings.json
├── LICENSE
├── CONTRIBUTING.md
└── README.md
```
