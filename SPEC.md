
## 1. Mission

Build a **public, MIT-licensed Claude Code plugin** that turns a set of related repositories
(a microservice project split across many repos) into a coordinated team of AI agents:

- A **master controller** receives an incident ticket or feature request.
- It routes the work to the **specialist agents** of the responsible repos.
- Those specialists **deliberate directly with each other** (Claude Code Agent Teams) over
  cross-repo impact, then converge.
- The output is a **consolidated change plan a developer validates and executes** — the agents
  **propose, they never edit or commit**.

A first-class **onboarding flow** introspects each repo, **builds an editable context** for it,
generates that repo's specialist agent, and **registers it with the master**. Re-running keeps
context in sync as the code changes.

### Non-goals
- The agents must not auto-apply edits, open PRs, push, or merge in v1. Output is a plan only.
- No telemetry, no network calls beyond the model API and (optionally, with explicit consent)
  cloning repos the user listed.
- Do not require any runtime the user doesn't already have *for the core path* (see §3).

---

## 2. Background the builder must respect (Claude Code facts)

- A plugin is a directory with `.claude-plugin/plugin.json` at the root; `agents/`, `skills/`,
  `commands/`, `hooks/` live at the plugin root (not inside `.claude-plugin/`).
- **Subagents** report only to their caller and cannot talk to each other. **Agent Teams**
  (experimental; requires Claude Code **v2.1.32+** and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
  give each teammate its own context and a **mailbox** for direct peer messaging. The
  "specialists discuss among themselves" requirement therefore uses **Agent Teams**, and a repo
  specialist is defined **once as a subagent definition** and reused as a teammate role.
- **Plugin-provided subagents ignore the `permissionMode`, `hooks`, and `mcpServers` frontmatter
  fields** by design. So read-only enforcement comes from the **`tools` allowlist**
  (`Read, Grep, Glob, Bash`), not a permission mode in the agent file.
- When run as a teammate, a subagent definition's `skills` and `mcpServers` frontmatter are not
  applied; teammates load context from the working directory's `CLAUDE.md` and from the spawn
  prompt. So each repo must carry its own context the specialist reads on startup.
- Claude Code can be installed via npm (**needs Node.js 18+**) **or** via a native binary
  (**needs no Node.js**). Therefore the core context engine must be **zero-dependency /
  prompt-driven**; any Node/Python/.NET tooling is an **optional accelerator** with graceful
  fallback.
- Distribution: a GitHub repo doubling as a single-plugin marketplace. Validate with
  `claude plugin validate` in CI.

---

## 3. Architecture: three tiers, layered by dependency

Implement **Tier 0 fully**. Scaffold **Tier 1** and **Tier 2** as optional, behind feature
detection, so the plugin is fully functional with zero external dependencies.

- **Tier 0 — Prompt-driven core (mandatory, zero deps).** Commands + skills instruct Claude to
  scan each repo and emit editable context, generate specialist agents, and maintain the
  registry. Works on every Claude Code install.
- **Tier 1 — Optional indexer (Node/TS by default; Python or .NET-AOT acceptable).** A small CLI
  that does deterministic, fast extraction (languages, frameworks, entry points, routes, emitted
  /consumed events, dependency graph, content fingerprint) and writes `facts.json`. Commands try
  it via Bash and fall back to Tier 0 if it's absent.
- **Tier 2 — Optional MCP server (TS).** Exposes the context/registry as live tools
  (`list_repos`, `get_repo_context`, `update_repo_context`, `register_agent`,
  `find_owning_repos`) so the master queries a service instead of reading files. For scale.

---

## 4. Two locations: the plugin vs. the user's workspace

**Critical separation.** The plugin ships templates and logic. The *generated, project-specific*
artifacts are written into the **user's workspace**, because plugin directories are installed/
read-only and per-project agents must be discoverable by Claude Code.

**Default workspace convention (flat-at-root).** All repos sit as **immediate subdirectories of
the workspace root**, and the user **runs `claude` from that root** (so the root is the working
directory; "installing at the root" means running from there with the plugin installed globally).
This single layout makes everything line up at once: every repo is one level down so it is
file-accessible with **no `--add-dir` flags**; project agents in `root/.claude/agents/` are
discovered because Claude walks up from the working directory; and the master reads
`root/.repo-orchestrator/registry.json` sitting beside the repos it describes. The only top-level
non-repo items are the two control dotfolders, which discovery ignores.

### 4a. The plugin repo (this GitHub project)
```
repo-orchestrator/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/
│   ├── repo-indexing/SKILL.md       # how to scan a repo and write a context doc (Tier 0)
│   └── routing/SKILL.md             # how the master reads registry.json to pick candidates
├── agents/
│   └── repo-specialist-template.md  # the template generated agents are based on
├── commands/
│   ├── init-context.md              # bootstrap: scan all repos → context → agents → registry
│   ├── sync-context.md              # incremental refresh on code/context change
│   ├── edit-context.md              # open/guide editing a repo's context
│   ├── triage.md                    # master controller: route → deliberate → plan
│   └── deliberate.md                # adversarial multi-repo root-cause mode
├── hooks/
│   └── hooks.json                   # SessionStart: warn if workspace has no registry yet
├── schemas/
│   ├── registry.schema.json         # JSON Schema for registry.json (validate in CI + at write)
│   └── context-template.md          # the editable per-repo context document template
├── indexer/                         # Tier 1 (optional)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── mcp/                             # Tier 2 (optional)
│   └── src/server.ts
├── automation/
│   └── triage_runner.mjs            # Agent SDK headless runner (webhook → triage → plan)
├── .github/workflows/validate.yml
├── examples/
│   └── workspace-template/.claude/settings.json   # enables Agent Teams
├── LICENSE                          # MIT
├── CONTRIBUTING.md
├── SPEC.md                          # this file
└── README.md
```

### 4b. The user's workspace (created/updated by `/init-context`)
```
my-project/                          # workspace ROOT — run `claude` here
├── .claude/
│   ├── settings.json                # CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1, teammateMode
│   └── agents/
│       ├── repo-auth-service.md     # GENERATED specialist (project scope = discoverable)
│       ├── repo-payments.md
│       └── repo-notifications.md
├── .repo-orchestrator/
│   ├── config.json                  # repo discovery settings (defaults work as-is)
│   ├── registry.json                # MASTER's source of truth (the "master is updated" artifact)
│   └── context/
│       ├── auth-service.md          # EDITABLE human-readable knowledge per repo
│       ├── payments.md
│       └── notifications.md
├── auth-service/                    # a repo (clone or submodule); ideally carries its own CLAUDE.md
├── payments/
├── notifications/
├── inventory/
└── shipping/
```
The repos are **direct children of the root** — the layout the user requested. Recommended way to
assemble it: make the root a git repo and add each service as a **git submodule** (one-command
clone, pinned versions), then commit `.repo-orchestrator/context/` and `.claude/agents/` so the
whole team shares the built context instead of regenerating it. Plain clones work identically.

---

## 5. Data contracts (build these exactly)

### 5a. `registry.json` — the master's source of truth
JSON Schema in `schemas/registry.schema.json`. Shape:
```jsonc
{
  "version": 1,
  "generatedAt": "<ISO8601>",
  "repos": [
    {
      "name": "auth-service",
      "path": "./auth-service",
      "agentType": "repo-auth-service",                       // project agent name
      "agentFile": ".claude/agents/repo-auth-service.md",
      "contextFile": ".repo-orchestrator/context/auth-service.md",
      "languages": ["TypeScript"],
      "frameworks": ["NestJS"],
      "owns": ["auth", "jwt", "sessions", "oauth", "rbac"],   // routing keywords/domains
      "endpoints": ["POST /login", "POST /token/refresh"],
      "emits": ["user.created"],
      "consumes": [],
      "dependsOn": [],
      "providesTo": ["payments", "notifications"],
      "fingerprint": "sha256:<hash of indexed inputs>",        // drift detection on sync
      "lastIndexed": "<ISO8601>",
      "userEdited": true                                       // preserve manual edits on re-sync
    }
  ]
}
```
Rules: every write validates against the schema; `find_owning_repos` / routing matches a ticket's
extracted keywords against `owns`/`endpoints`/`emits`/`consumes`; `userEdited: true` sections are
never overwritten by `/sync-context` without explicit confirmation.

### 5b. `context-template.md` — the editable per-repo context
A markdown doc with YAML frontmatter (the structured bits mirrored into `registry.json`) followed
by prose the user freely edits:
```markdown
---
name: auth-service
path: ./auth-service
languages: [TypeScript]
frameworks: [NestJS]
owns: [auth, jwt, sessions, oauth, rbac]
endpoints: [POST /login, POST /token/refresh]
emits: [user.created]
consumes: []
dependsOn: []
providesTo: [payments, notifications]
---
# auth-service — context

## Purpose
<what this service is responsible for>

## Architecture & key modules
<entry points, layering, important directories and what lives there>

## Public contracts
- Endpoints: ...
- Events emitted/consumed: ...
- Shared fields other services rely on (e.g. JWT claims): ...

## Data stores
<dbs, schemas, migrations of note>

## Cross-repo dependencies
<what it needs from / provides to which repos>

## Known issues / gotchas
<sharp edges a specialist should know before proposing changes>

## Glossary
<domain terms>
```
`/sync-context` reads the frontmatter back into `registry.json`; prose informs the specialist.

### 5c. `config.json` — repo discovery
Written by `/init-context`; the default needs no editing for the flat-at-root layout.
```json
{
  "discovery": {
    "mode": "auto",
    "root": ".",
    "exclude": [".git", ".claude", ".repo-orchestrator", "node_modules"]
  }
}
```
**Discovery rule (`mode: "auto"`):** a managed repo is any **immediate subdirectory of `root`
that is a git repository** (contains `.git`, or is a registered submodule), minus `exclude`.
This is the config-free default for the requested layout — drop a new service folder in, run
`/sync-context`, and it is picked up. For repos that don't live under the root (external paths,
monorepo packages), switch to an explicit list, which disables scanning:
```json
{
  "discovery": {
    "mode": "list",
    "repos": [
      { "name": "auth-service", "path": "../shared/auth-service" },
      { "name": "payments",     "path": "./packages/payments" }
    ]
  }
}
```
For listed repos outside the root, the user also launches with `--add-dir <path>` per external
repo (file access only; agents still come from the plugin + `.claude/agents/`).

---

## 6. Commands — exact behavior

### `/init-context`  (bootstrap; the heart of onboarding)
1. **Discover repos.** Read `.repo-orchestrator/config.json` (create it with the `mode: "auto"`
   default from §5c if missing). In `auto` mode, **scan immediate subdirectories of the workspace
   root and keep the ones that are git repositories** (clone or submodule), minus the `exclude`
   list. In `list` mode, use the explicit `repos` array and do not scan. If an entry references a
   remote URL that isn't cloned yet, **ask for explicit confirmation before cloning** (network +
   write).
2. **Index each repo.** Try Tier-1 indexer via Bash (`node indexer/dist/index.js <path>` →
   `facts.json`); if unavailable, run the **Tier-0 prompt-driven scan** per `repo-indexing` skill:
   read README, package/build manifests (`package.json`, `*.csproj`, `pom.xml`, `go.mod`,
   `pyproject.toml`, `Gemfile`, ...), the top-level directory map, and a bounded sample of
   route/controller/entry/event files. **Be budget-aware**: do not read every file in large repos;
   prioritize manifests, entry points, and route/event definitions.
3. **Synthesize editable context.** Write `.repo-orchestrator/context/<name>.md` from
   `context-template.md`, filling frontmatter (`owns`, `endpoints`, `emits`, `consumes`,
   `dependsOn`, `providesTo`) and prose.
4. **PAUSE for review.** Print a concise per-repo summary and **stop**: tell the user to review and
   edit the context files, and offer to open them. Do not proceed until the user confirms. This is
   the "allow the user to edit the context if required" requirement — make it a hard checkpoint.
5. **On confirm — register.** For each repo: generate `.claude/agents/repo-<name>.md` from
   `repo-specialist-template.md` (inject name, path, `owns`, and a precise routing-oriented
   `description`), then **upsert the `registry.json` entry** (with fingerprint + `lastIndexed`).
   Ensure `.claude/settings.json` has Agent Teams enabled (offer to add it).
6. **Report.** "Master now knows N repo agents: …" and remind the user to restart the session so
   newly written project agents load.

### `/sync-context [repo]`
Detect drift via fingerprint (git HEAD / file hashes) for all repos or a named one; re-index only
changed repos; **preserve `userEdited` content** (diff and ask before overwriting edited sections);
ingest manual edits to context frontmatter back into `registry.json`; refresh agent files if
`owns`/description materially changed. Summarize what changed in the registry.

### `/edit-context <repo>`
Resolve the repo's context file from the registry and open/guide editing it; on save, run the
frontmatter→registry ingest step. (May be a thin wrapper around presenting the file + `/sync-context`.)

### `/triage <ticket>`  and  `/deliberate <incident>`
As in the working scaffold, but routing now reads **`registry.json`** (via the `routing` skill)
instead of a hand-maintained table. Master flow: load registry → decompose ticket → select
candidate repos (cap ~5; one repo ⇒ skip the team and use a single subagent) → spawn candidates as
an Agent Team using their `agentType`, **require plan approval** so they stay read-only → collect
verdicts, drop `NOT_RESPONSIBLE` → responsible specialists deliberate over contracts via the
mailbox (`/deliberate` makes this adversarial for unclear root causes) → synthesize one plan for
the developer → clean up the team. **Propose only; never edit.**

---

## 7. The specialist template (read-only, propose-only)
Frontmatter: `name`, a precise routing `description`, `tools: Read, Grep, Glob, Bash`,
`model: inherit`, a `color`. Body: read your repo's context file + `CLAUDE.md` on startup; do the
cheap **VERDICT** step first (`RESPONSIBLE | PARTIALLY_RESPONSIBLE | NOT_RESPONSIBLE` + confidence);
analyze with cited paths/evidence; **deliberate** with named teammates over any cross-repo contract;
return the fixed report block (REPO / VERDICT / SUMMARY / AFFECTED AREAS / PROPOSED CHANGES (plan
only) / CROSS-REPO DEPENDENCIES / RISKS & UNKNOWNS / VALIDATION HINTS). Hard rule: never modify a
file; `Bash` is for inspection only. (Document the optional project-scoped `PreToolUse` hook that
hard-blocks write-like Bash, since plugin agents can't carry their own hooks.)

---

## 8. Tier 1 indexer (optional) — spec
- **Language:** TypeScript on Node 18+ (default). Acceptable alternatives: Python (tree-sitter
  bindings) or a .NET 8 AOT single-file binary (zero runtime dep, plays to a .NET author's
  strength; ship per-platform binaries).
- **Deps (TS):** `fast-glob`, `simple-git`, `web-tree-sitter` (AST route/export/event extraction),
  `zod` (validate output against the registry schema).
- **CLI:** `index <repoPath>` → prints `facts.json` to stdout: `{ languages, frameworks,
  entryPoints, endpoints, emits, consumes, dependsOn (from manifest deps mapped to known repos),
  fileCount, fingerprint }`.
- **Contract:** must be invokable headlessly and degrade silently (commands fall back to Tier 0 if
  `node`/binary or the indexer is missing). Never write outside stdout; the command owns file writes.

## 9. Tier 2 MCP server (optional) — spec
TypeScript with `@modelcontextprotocol/sdk`. Tools: `list_repos`, `get_repo_context(name)`,
`update_repo_context(name, patch)`, `register_agent(entry)`, `find_owning_repos(keywords)`.
Bundle it via `plugin.json`'s MCP config so the master can query live context at scale. Keep it
optional and documented; Tier 0/1 must work without it.

## 10. Automation (Agent SDK) — spec
`automation/triage_runner.mjs`: load the plugin by local path, set
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, run the `/triage` flow on a ticket from argv/stdin,
capture the final plan, and expose a function a GitHub/Jira webhook handler can call to post the
plan back as a comment. Pin the SDK version and verify the current plugin-loading option shape
against the Agent SDK docs. Keep it propose-only (`permissionMode: "plan"`, read+delegate tools).

---

## 11. Packaging, CI, docs, license
- `plugin.json`: `name`, `version` (semver), `description`, `author`, `keywords`, `repository`
  (string URL). `marketplace.json` (self-referential single-plugin, `source: "./"`).
- `.github/workflows/validate.yml`: install Claude Code, run `claude plugin validate`; validate
  `registry.schema.json` is valid JSON Schema; lint/build the indexer and MCP if present.
- `README.md`: what it does, the subagents-vs-Agent-Teams rationale, prerequisites (Claude Code
  v2.1.32+, Agent Teams env var), workspace setup, install
  (`/plugin marketplace add <user>/<repo>` then `/plugin install repo-orchestrator@repo-orchestrator-dev`),
  the `/init-context` → review/edit → register flow, `/triage` usage, the propose-only safety model,
  cost notes (routing keeps teams at 3–5), and the optional tiers.
- `CONTRIBUTING.md`: how to add a Tier-1 language parser, how to test commands, code style.
- `LICENSE`: MIT.

---

## 12. Acceptance criteria (definition of done)
1. Fresh install on a workspace with 5+ repos: `/init-context` produces an editable context file
   per repo, **pauses for edits**, and on confirm writes project agents + a schema-valid
   `registry.json`.
2. Editing a context file and running `/sync-context` updates the registry without clobbering
   `userEdited` content.
3. `/triage` on a cross-repo ticket engages only the responsible repos (verified by the printed
   candidate set), the specialists exchange at least one mailbox message, and the result is a
   single plan with **zero file modifications** anywhere.
4. The entire Tier-0 path runs with **no Node/Python/.NET** installed (native-binary Claude Code).
5. `claude plugin validate` passes in CI.
6. Everything is documented well enough that a stranger can install and use it from the README alone.

---

## 13. Build order (suggested)
1. `plugin.json` + `marketplace.json` + `LICENSE` + skeleton README → `claude plugin validate` green.
2. `schemas/` (registry schema + context template) and the `repo-specialist-template.md`.
3. `repo-indexing` + `routing` skills (Tier 0).
4. `/init-context`, `/sync-context`, `/edit-context`.
5. `/triage`, `/deliberate`.
6. `hooks/hooks.json` (SessionStart "run /init-context first" nudge).
7. README + CONTRIBUTING + CI.
8. Tier 1 indexer, then Tier 2 MCP, then `automation/triage_runner.mjs`.
9. End-to-end test against a sample 3-repo workspace; tune routing and the verdict step.
```
