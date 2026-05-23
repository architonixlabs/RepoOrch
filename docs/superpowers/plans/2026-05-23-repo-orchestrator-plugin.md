# repo-orchestrator Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public MIT-licensed Claude Code plugin that turns a set of related repositories into a coordinated team of AI agents that propose (never apply) consolidated change plans for a given ticket or incident.

**Architecture:** A three-tier system — Tier 0 (prompt-driven, zero deps) implements all core functionality via commands and skills; Tier 1 (optional Node/TS indexer) accelerates extraction; Tier 2 (optional MCP server) exposes context as live tools. Generated per-project artifacts (specialist agents, registry, context docs) live in the user's workspace, not in the plugin repo. All agents are strictly read-only; they propose changes via a structured report and never edit files.

**Tech Stack:** Claude Code plugin format (`.claude-plugin/plugin.json`), Markdown command/skill/agent files, JSON Schema (registry validation), TypeScript + Node 18+ (Tier 1 indexer: `fast-glob`, `simple-git`, `zod`), TypeScript + `@modelcontextprotocol/sdk` (Tier 2 MCP server), ESM Node script (automation runner).

---

## File Map

Files to create (full list, grouped by build order):

**Task 1 — Plugin scaffold**
- `Create: .claude-plugin/plugin.json`
- `Create: .claude-plugin/marketplace.json`
- `Create: LICENSE`
- `Create: README.md` (skeleton; full content in Task 7)
- `Create: .github/workflows/validate.yml`

**Task 2 — Schemas & templates**
- `Create: schemas/registry.schema.json`
- `Create: schemas/context-template.md`
- `Create: agents/repo-specialist-template.md`

**Task 3 — Core skills (Tier 0)**
- `Create: skills/repo-indexing/SKILL.md`
- `Create: skills/routing/SKILL.md`

**Task 4 — Commands**
- `Create: commands/init-context.md`
- `Create: commands/sync-context.md`
- `Create: commands/edit-context.md`

**Task 5 — Commands (continued)**
- `Create: commands/triage.md`
- `Create: commands/deliberate.md`

**Task 6 — Hooks and examples**
- `Create: hooks/hooks.json`
- `Create: examples/workspace-template/.claude/settings.json`

**Task 7 — Docs**
- `Modify: README.md` (full content)
- `Create: CONTRIBUTING.md`

**Task 8 — Tier 1 indexer**
- `Create: indexer/package.json`
- `Create: indexer/tsconfig.json`
- `Create: indexer/src/index.ts`

**Task 9 — Tier 2 MCP server**
- `Create: mcp/package.json`
- `Create: mcp/tsconfig.json`
- `Create: mcp/src/server.ts`

**Task 10 — Automation runner**
- `Create: automation/triage_runner.mjs`

---

## Task 1: Plugin scaffold

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `LICENSE`
- Create: `README.md`
- Create: `.github/workflows/validate.yml`

- [ ] **Step 1.1: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "repo-orchestrator",
  "version": "0.1.0",
  "description": "Turns a multi-repo microservice project into a coordinated AI agent team that proposes (never applies) cross-repo change plans.",
  "author": "Architonix",
  "keywords": ["multi-repo", "microservices", "agent-teams", "orchestration", "planning"],
  "repository": "https://github.com/Architonix/RepoOrch",
  "commands": [
    "commands/init-context.md",
    "commands/sync-context.md",
    "commands/edit-context.md",
    "commands/triage.md",
    "commands/deliberate.md"
  ],
  "skills": [
    "skills/repo-indexing/SKILL.md",
    "skills/routing/SKILL.md"
  ],
  "agents": [
    "agents/repo-specialist-template.md"
  ],
  "hooks": "hooks/hooks.json",
  "mcp": {
    "optional": true,
    "entrypoint": "mcp/dist/server.js",
    "description": "Tier 2 optional MCP server — exposes registry as live tools. Only active when built."
  }
}
```

- [ ] **Step 1.2: Create `.claude-plugin/marketplace.json`**

```json
{
  "plugins": [
    {
      "name": "repo-orchestrator",
      "source": "./",
      "description": "Coordinates a multi-repo microservice project as a propose-only AI agent team.",
      "tags": ["multi-repo", "orchestration", "agent-teams"]
    }
  ]
}
```

- [ ] **Step 1.3: Create `LICENSE`**

```
MIT License

Copyright (c) 2026 Architonix

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 1.4: Create skeleton `README.md`**

```markdown
# repo-orchestrator

> Claude Code plugin — coordinates a multi-repo microservice project as a propose-only AI agent team.

Full documentation coming in Task 7. See `SPEC.md` for the complete specification.
```

- [ ] **Step 1.5: Create `.github/workflows/validate.yml`**

```yaml
name: Validate Plugin

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Validate plugin
        run: claude plugin validate .

      - name: Validate registry JSON Schema
        run: |
          node -e "
            const fs = require('fs');
            const schema = JSON.parse(fs.readFileSync('schemas/registry.schema.json', 'utf8'));
            if (!schema['\$schema']) throw new Error('Missing \$schema field');
            if (!schema.properties) throw new Error('Missing properties');
            console.log('registry.schema.json is valid JSON Schema');
          "

      - name: Setup Node for indexer
        uses: actions/setup-node@v4
        with:
          node-version: "18"

      - name: Build and lint Tier-1 indexer (if present)
        run: |
          if [ -f indexer/package.json ]; then
            cd indexer
            npm ci
            npm run build
            npm run lint || true
          else
            echo "Tier-1 indexer not present, skipping"
          fi

      - name: Build Tier-2 MCP server (if present)
        run: |
          if [ -f mcp/package.json ]; then
            cd mcp
            npm ci
            npm run build
          else
            echo "Tier-2 MCP server not present, skipping"
          fi
```

- [ ] **Step 1.6: Commit**

```bash
git add .claude-plugin/ LICENSE README.md .github/workflows/validate.yml
git commit -m "feat: scaffold plugin — plugin.json, marketplace.json, LICENSE, CI"
```

---

## Task 2: Schemas and templates

**Files:**
- Create: `schemas/registry.schema.json`
- Create: `schemas/context-template.md`
- Create: `agents/repo-specialist-template.md`

- [ ] **Step 2.1: Create `schemas/registry.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://github.com/Architonix/RepoOrch/schemas/registry.schema.json",
  "title": "RepoOrchestrator Registry",
  "description": "Master source of truth for all managed repos and their specialist agents.",
  "type": "object",
  "required": ["version", "generatedAt", "repos"],
  "additionalProperties": false,
  "properties": {
    "version": {
      "type": "integer",
      "const": 1,
      "description": "Schema version — always 1 for v1."
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO8601 timestamp of the last full generation."
    },
    "repos": {
      "type": "array",
      "description": "One entry per managed repository.",
      "items": {
        "type": "object",
        "required": [
          "name", "path", "agentType", "agentFile", "contextFile",
          "languages", "frameworks", "owns", "endpoints", "emits",
          "consumes", "dependsOn", "providesTo", "fingerprint", "lastIndexed"
        ],
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string",
            "description": "Short identifier — matches the directory name.",
            "pattern": "^[a-z0-9-]+$"
          },
          "path": {
            "type": "string",
            "description": "Relative path from workspace root, e.g. './auth-service'."
          },
          "agentType": {
            "type": "string",
            "description": "The Claude Code agent name, e.g. 'repo-auth-service'.",
            "pattern": "^repo-[a-z0-9-]+$"
          },
          "agentFile": {
            "type": "string",
            "description": "Relative path to the generated agent markdown file."
          },
          "contextFile": {
            "type": "string",
            "description": "Relative path to the editable context markdown file."
          },
          "languages": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Programming languages detected in this repo."
          },
          "frameworks": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Frameworks detected, e.g. ['NestJS', 'Prisma']."
          },
          "owns": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Routing keywords / domain areas this repo owns."
          },
          "endpoints": {
            "type": "array",
            "items": { "type": "string" },
            "description": "HTTP endpoints exposed, e.g. ['POST /login']."
          },
          "emits": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Events this repo emits."
          },
          "consumes": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Events this repo subscribes to from other services."
          },
          "dependsOn": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Names of other repos this repo depends on."
          },
          "providesTo": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Names of other repos that consume this repo's APIs/events."
          },
          "fingerprint": {
            "type": "string",
            "description": "SHA-256 hash of indexed inputs for drift detection.",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "lastIndexed": {
            "type": "string",
            "format": "date-time",
            "description": "ISO8601 timestamp of the last index run."
          },
          "userEdited": {
            "type": "boolean",
            "description": "True when a human has manually edited this entry. /sync-context will not overwrite without confirmation."
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2.2: Create `schemas/context-template.md`**

```markdown
---
name: <repo-name>
path: ./<repo-name>
languages: []
frameworks: []
owns: []
endpoints: []
emits: []
consumes: []
dependsOn: []
providesTo: []
---
# <repo-name> — context

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

- [ ] **Step 2.3: Create `agents/repo-specialist-template.md`**

````markdown
---
name: repo-{{NAME}}
description: "Specialist for the {{NAME}} repo (owns: {{OWNS_CSV}}). Routes to this agent for tickets touching {{OWNS_CSV}} or endpoints {{ENDPOINTS_CSV}}."
tools: Read, Grep, Glob, Bash
model: inherit
color: blue
---

# Repo Specialist: {{NAME}}

You are the specialist agent for the **{{NAME}}** repository located at `{{PATH}}`.

## Startup (always do this first)

1. Read `.repo-orchestrator/context/{{NAME}}.md` — this is your primary knowledge base.
2. If a `CLAUDE.md` exists in `{{PATH}}/`, read it for project-specific conventions.
3. Do NOT read any other repo's context unless you need to verify a cross-repo contract.

## Responsibility verdict (do this before any analysis)

After reading your context, output one of:

```
VERDICT: RESPONSIBLE | confidence: <0-100>%
```
```
VERDICT: PARTIALLY_RESPONSIBLE | confidence: <0-100>%
```
```
VERDICT: NOT_RESPONSIBLE | confidence: <0-100>%
```

A concise one-line reason must follow the verdict line.

If NOT_RESPONSIBLE with confidence ≥ 80%, stop here and return only the verdict block.

## Analysis

When RESPONSIBLE or PARTIALLY_RESPONSIBLE:

1. Read the relevant source files in `{{PATH}}/` using Read, Grep, Glob. Use Bash only for inspection (e.g., `git log`, directory listing) — **never to write, create, or modify files**.
2. Cite file paths and line numbers for every claim.
3. If the ticket touches a contract another service depends on (endpoint shape, event schema, JWT claims, shared DB schema), name that service explicitly and flag it as a cross-repo dependency.

## Deliberation with teammates

When the master places you in an Agent Team and you identify a cross-repo dependency:

1. Send a mailbox message to the relevant teammate(s): name the exact contract that may change (endpoint path, payload field, event name), what you propose to change, and what you need them to confirm.
2. Wait for their response before finalising your PROPOSED CHANGES section.
3. Acknowledge their concerns in your final report.

## Output report (required format)

Return exactly this block when your analysis is complete:

```
---
REPO: {{NAME}}
VERDICT: <RESPONSIBLE|PARTIALLY_RESPONSIBLE|NOT_RESPONSIBLE>
SUMMARY: <one sentence>
AFFECTED AREAS:
  - <file or module>: <why affected>
PROPOSED CHANGES:
  - <description of change — plan only, no code edits>
  - ...
CROSS-REPO DEPENDENCIES:
  - <repo-name>: <what contract is affected and how>
RISKS & UNKNOWNS:
  - <risk or open question>
VALIDATION HINTS:
  - <how a developer can verify this change is safe>
---
```

## Hard rules

- **Never modify a file.** Read-only at all times.
- **Never commit, push, open a PR, or run any destructive command.**
- `Bash` is for read-only inspection only: `cat`, `ls`, `grep`, `git log`, `git diff`, `git show`, `find`. If in doubt, use Read/Grep/Glob instead.
- If the master gave you a `PreToolUse` hook that blocks write-like Bash commands, do not attempt to circumvent it.
- The output is a **plan** — the developer decides what to execute.

## Note on project-scoped PreToolUse hook

Plugin agents cannot carry their own hooks. To hard-block write-like Bash commands workspace-wide, add a project-scoped `PreToolUse` hook in `.claude/settings.json` that checks `tool_input.command` against a denylist (e.g., `rm`, `mv`, `cp`, `write`, `sed -i`, `tee`, `git commit`, `git push`, `git add`). This is optional but recommended for teams where strict read-only enforcement matters.
````

- [ ] **Step 2.4: Commit**

```bash
git add schemas/ agents/
git commit -m "feat: add registry schema, context template, and specialist agent template"
```

---

## Task 3: Core skills — `repo-indexing` and `routing`

**Files:**
- Create: `skills/repo-indexing/SKILL.md`
- Create: `skills/routing/SKILL.md`

- [ ] **Step 3.1: Create `skills/repo-indexing/SKILL.md`**

```markdown
# Repo Indexing Skill (Tier 0)

Use this skill when you need to scan a repository and produce structured context for it. This is the fallback when the Tier-1 indexer is unavailable.

## Goal

Produce a filled-in context document (based on `schemas/context-template.md`) and the structured fields needed for `registry.json`:
- `languages`, `frameworks`
- `owns` (domain keywords)
- `endpoints` (HTTP routes exposed)
- `emits`, `consumes` (events)
- `dependsOn`, `providesTo` (repo names)
- `fingerprint` (sha256 of indexed inputs — computed as described below)

## Budget rule

Large repos can have hundreds of files. **Do not read every file.** Prioritise in this order:
1. `README.md` or `README.*` — purpose, architecture overview
2. Package/build manifest: `package.json`, `*.csproj`, `pom.xml`, `go.mod`, `pyproject.toml`, `Gemfile`, `Cargo.toml`
3. Top-level directory listing (one level deep) — understand the module structure
4. Entry point files: `src/main.*`, `cmd/main.*`, `app.*`, `server.*`, `index.*` (max 3 files)
5. Route/controller/handler files: files named `*.routes.*`, `*.controller.*`, `*.handler.*`, `router.*` (max 5 files, first 100 lines each)
6. Event definition files: files named `*.events.*`, `events.*`, `*.pubsub.*` (max 3 files)

Stop reading once you have enough to fill in all frontmatter fields. Do not read test files, migration files, or lock files unless there is no other way to determine a field.

## Language and framework detection

- **Languages:** Determined by file extensions present. Common mappings: `.ts`/`.tsx` → TypeScript, `.js`/`.mjs` → JavaScript, `.py` → Python, `.cs` → C#, `.go` → Go, `.java` → Java, `.rb` → Ruby, `.rs` → Rust.
- **Frameworks:** Read the manifest. For `package.json`, check `dependencies` and `devDependencies` for: `@nestjs/core` → NestJS, `express` → Express, `fastify` → Fastify, `next` → Next.js. For `pom.xml`: `spring-boot` → Spring Boot. For `*.csproj`: `Microsoft.AspNetCore` → ASP.NET Core. For `go.mod`: `gin-gonic/gin` → Gin, `labstack/echo` → Echo. For `pyproject.toml`/`requirements.txt`: `fastapi` → FastAPI, `django` → Django, `flask` → Flask.

## Owns / domain keyword extraction

From README and entry points, extract the primary domain responsibilities. Express as short lowercase keywords (e.g., `auth`, `jwt`, `sessions`, `oauth`, `rbac`). Aim for 3–8 keywords that a ticket author would use when describing a problem in this area.

## Endpoint extraction

Scan route/controller files for HTTP method + path patterns:
- Express/Fastify: `router.get('/path'`, `app.post('/path'`
- NestJS: `@Get('/path')`, `@Post('/path')`
- ASP.NET: `[HttpGet("path")]`, `[Route("path")]`
- Spring Boot: `@GetMapping("/path")`, `@PostMapping`
- FastAPI: `@app.get("/path")`, `@router.post`
- Gin: `r.GET("/path"`, `r.POST`

Format each as `METHOD /path`, e.g. `POST /login`.

## Event extraction

Look for publish/emit calls and subscribe/consume registrations:
- Node.js: `emit('event.name'`, `publish('event.name'`, `subscribe('event.name'`
- NestJS EventEmitter: `@OnEvent('event.name')`, `this.eventEmitter.emit('event.name'`
- Message brokers: `channel.publish(`, `consumer.subscribe(`, `producer.send(`
- Look for string constants named `*_EVENT`, `EVENT_*`, or files like `events.ts`/`events.py`

Classify each as `emits` (this repo publishes) or `consumes` (this repo subscribes/handles).

## Dependency graph

From the manifest's `dependencies` / `imports`, identify names that match other repos in this workspace. Cross-reference with the `registry.json` repo names list if available. Fill `dependsOn` (repos this one calls) and `providesTo` (repos that call this one — infer from the others' `dependsOn`).

## Fingerprint calculation

The fingerprint is a SHA-256 hash used for drift detection. Compute it as:
1. Get the git HEAD commit SHA: run `git rev-parse HEAD` in the repo directory
2. Get the total file count: run `git ls-files | wc -l` in the repo directory
3. Get the manifest modification timestamp from the file system
4. Concatenate: `<HEAD_SHA>:<fileCount>:<manifestMtime>`
5. Produce the SHA-256 of that string
6. Format as `sha256:<hex64>`

If git is unavailable (not a git repo), use the manifest content hash instead.

## Output

Produce the filled-in content for `.repo-orchestrator/context/<name>.md` using the template from `schemas/context-template.md`. Populate all frontmatter fields. Write a short but accurate prose section for each heading. Do not leave any section empty — write "None identified." if genuinely nothing was found.
```

- [ ] **Step 3.2: Create `skills/routing/SKILL.md`**

```markdown
# Routing Skill

Use this skill when the master controller needs to select which repo specialist agents to involve for a given ticket or incident description.

## Goal

Given a ticket/incident text and the current `registry.json`, return a ranked list of candidate repos (cap at 5). Each candidate must have a confidence score and a reason.

## Step-by-step routing

### 1. Load the registry

Read `.repo-orchestrator/registry.json`. Extract the `repos` array. For each repo, the routing-relevant fields are:
- `name`
- `owns` — domain keywords
- `endpoints` — HTTP routes
- `emits` / `consumes` — event names
- `languages` / `frameworks` — for tech-specific tickets

### 2. Extract keywords from the ticket

Parse the ticket text for:
- Domain terms (e.g., "login", "token", "payment", "invoice", "notification")
- HTTP paths (e.g., `/api/auth`, `/payments/refund`)
- Event names (e.g., `user.created`, `order.placed`)
- Error messages containing service-specific strings
- Explicit service/repo names mentioned by the reporter

Normalise to lowercase. Strip common stop words (the, a, an, is, was, etc.).

### 3. Score each repo

For each repo, compute a match score:
- **Exact keyword match in `owns`:** +3 points per match
- **Partial/substring match in `owns`:** +1 point per match
- **Endpoint match** (ticket mentions a path present in `endpoints`): +4 points
- **Event match** (ticket mentions an event in `emits` or `consumes`): +3 points
- **Framework/language match** (ticket mentions a tech in `languages`/`frameworks`): +1 point
- **Explicit name mention** (ticket text contains the repo `name`): +5 points

### 4. Filter and cap

- Keep repos with score > 0.
- Sort descending by score.
- Cap at **5 candidates**.
- If only 1 candidate has score > 0, skip the Agent Team entirely and use a single subagent.
- If 0 candidates, report "No responsible repo identified. Review `registry.json` `owns` fields."

### 5. Return a routing decision

Output in this format:

```
ROUTING DECISION
================
Ticket keywords: <comma-separated extracted keywords>

Candidates (ranked):
1. <repo-name>  score=<N>  reason="<matched owns/endpoints/events>"
2. <repo-name>  score=<N>  reason="..."
...

Action: <"Spawn Agent Team with candidates 1-N" | "Use single subagent: <repo-name>" | "No candidate found">
```

### 6. Edge cases

- **New repo not in registry:** If the ticket mentions a directory that exists in the workspace but has no registry entry, note it: "Warning: `<dir>` appears in workspace but is not registered. Run `/init-context` or `/sync-context`."
- **Registry missing:** If `.repo-orchestrator/registry.json` does not exist, stop and instruct: "Registry not found. Run `/init-context` first."
- **All repos score equally:** Prefer repos whose `owns` contains the most specific (rarest) keyword match.
```

- [ ] **Step 3.3: Commit**

```bash
git add skills/
git commit -m "feat: add repo-indexing and routing skills (Tier 0)"
```

---

## Task 4: Commands — `/init-context`, `/sync-context`, `/edit-context`

**Files:**
- Create: `commands/init-context.md`
- Create: `commands/sync-context.md`
- Create: `commands/edit-context.md`

- [ ] **Step 4.1: Create `commands/init-context.md`**

The file content instructs Claude how to perform the bootstrap flow. Write it as a fenced markdown block:

```
---
name: init-context
description: "Bootstrap: discover all repos in the workspace, index them, generate editable context docs and specialist agents, and register them with the master. Pauses for user review before writing agents."
---

# /init-context

Bootstrap the repo-orchestrator for your workspace. Run this once from your workspace root (the directory that contains your service repos as immediate subdirectories).

## What this command does

1. Discovers all repos under the workspace root
2. Indexes each repo (language, frameworks, endpoints, events, dependencies)
3. Writes an editable context document per repo — **then stops for your review**
4. On your confirmation: generates specialist agents and updates `registry.json`

---

## Step 1 — Discover repos

Read `.repo-orchestrator/config.json` if it exists. If it does not exist, create it with this default content:

{
  "discovery": {
    "mode": "auto",
    "root": ".",
    "exclude": [".git", ".claude", ".repo-orchestrator", "node_modules"]
  }
}

**If `mode` is `"auto"`:**
List all immediate subdirectories of `root`. Keep the ones that contain a `.git` directory (or are listed in `.git/modules`, indicating a submodule). Remove any directory whose name appears in `exclude`.

**If `mode` is `"list"`:**
Use the `repos` array as-is. Do not scan. For any entry whose `path` starts with a URL (e.g., `https://`):
- Ask the user explicitly: "Clone `<url>` into `<local-path>`? This requires a network connection and will write to your filesystem. [y/N]"
- Do not clone without explicit confirmation.

If no repos are discovered, stop and output: "No git repositories found as immediate subdirectories of `<root>`. Check your workspace layout or switch to `mode: list` in `.repo-orchestrator/config.json`."

---

## Step 2 — Index each repo

For each discovered repo, **try the Tier-1 indexer first**:

```bash
node indexer/dist/index.js <repoPath>
```

If this command succeeds (exit code 0), parse the JSON output as `facts`. If it fails or the file does not exist, fall back to **Tier-0 indexing using the `repo-indexing` skill** — read this skill now if you have not already:
`skills/repo-indexing/SKILL.md`

Apply the budget rule from that skill. Do not read every file. Extract: `languages`, `frameworks`, `owns`, `endpoints`, `emits`, `consumes`, `dependsOn`, `providesTo`, `fingerprint`.

---

## Step 3 — Write context documents

For each repo, create `.repo-orchestrator/context/<name>.md`:
- Copy the template from `schemas/context-template.md`
- Fill in all frontmatter fields with the indexed values
- Fill in the prose sections (Purpose, Architecture & key modules, Public contracts, Data stores, Cross-repo dependencies, Known issues / gotchas, Glossary) with your findings
- If a field is empty (e.g., no events found), write the empty array `[]` in frontmatter and "None identified." in the prose section

Do NOT create `.claude/agents/` files yet. Do NOT update `registry.json` yet.

---

## Step 4 — PAUSE for review (hard checkpoint)

After writing all context files, output this message and **stop**. Do not proceed until the user responds.

```
✅ Context files written for N repo(s):

  • auth-service    → .repo-orchestrator/context/auth-service.md
  • payments        → .repo-orchestrator/context/payments.md
  ...

📝 Please review and edit these files now.
   Pay attention to:
   - The `owns` field (used for routing — add domain keywords a ticket author would use)
   - The `endpoints`, `emits`, `consumes` fields (cross-repo contracts)
   - The prose sections (your specialist agents will read these)

   To open a context file: use your editor or run `/edit-context <name>`.

When you are happy with the context files, reply "done" or "register" to generate the specialist agents and update the registry.
```

---

## Step 5 — Register (on user confirmation)

Wait for the user to reply with "done", "register", "yes", "continue", or similar affirmative. Then:

### 5a — Generate specialist agents

For each repo, create `.claude/agents/repo-<name>.md` from `agents/repo-specialist-template.md`:
- Replace `{{NAME}}` with the repo name
- Replace `{{PATH}}` with the repo path (e.g., `./auth-service`)
- Replace `{{OWNS_CSV}}` with the `owns` array joined by `, `
- Replace `{{ENDPOINTS_CSV}}` with the `endpoints` array joined by `, ` (or "none" if empty)

Read the current values from the context file's frontmatter (the user may have edited them).

### 5b — Write / update `registry.json`

For each repo, upsert the entry in `.repo-orchestrator/registry.json`. Structure per `schemas/registry.schema.json`. Set `lastIndexed` to the current ISO8601 timestamp. Set `userEdited: false` (the user has reviewed but this is the first write). Validate the file against `schemas/registry.schema.json` before saving.

### 5c — Ensure `.claude/settings.json` has Agent Teams enabled

Check whether `.claude/settings.json` exists. If it does not exist, offer to create it:

"May I create `.claude/settings.json` to enable Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)? This is required for the multi-repo deliberation flow. [y/N]"

If the user agrees, create:

{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "experimental": {
    "teammateMode": true
  }
}

If the file exists, check if `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is already set. If not, offer to add it.

---

## Step 6 — Report

Output a summary:

```
🎉 Master now knows N repo agent(s):

  repo-auth-service    → .claude/agents/repo-auth-service.md
  repo-payments        → .claude/agents/repo-payments.md
  ...

Registry updated: .repo-orchestrator/registry.json

⚠️  Please restart your Claude Code session so the newly written project agents are loaded.
    Then use /triage <ticket> to route work to the appropriate specialists.
```
```

- [ ] **Step 4.2: Create `commands/sync-context.md`**

```
---
name: sync-context
description: "Incremental refresh: detect repo drift via fingerprint, re-index changed repos, preserve userEdited content, ingest context frontmatter back into registry.json."
---

# /sync-context [repo]

Refresh the registry for all repos, or a single named repo.

Usage:
- `/sync-context` — refresh all repos
- `/sync-context auth-service` — refresh only the `auth-service` repo

---

## Step 1 — Load registry

Read `.repo-orchestrator/registry.json`. If it does not exist, stop: "Registry not found. Run `/init-context` first."

If a repo name was provided, find that entry. If not found, stop: "Repo `<name>` not found in registry. Available: <list names>."

---

## Step 2 — Detect drift

For each repo to process:

1. Compute a fresh fingerprint using the method from `skills/repo-indexing/SKILL.md`.
2. Compare to `registry.json` entry's `fingerprint`.
3. Also check if the context file (`.repo-orchestrator/context/<name>.md`) has been modified since `lastIndexed` (compare file mtime to the `lastIndexed` timestamp).

**Decision:**
- If fingerprint unchanged AND context file not modified: repo is up to date. Skip it and report "No drift detected."
- If fingerprint changed: code has changed — re-index.
- If context file is newer than `lastIndexed`: user has made manual edits — ingest frontmatter (Step 3b).

---

## Step 3a — Re-index changed repos

For each repo where code drift was detected:
- Run the same indexing flow as `/init-context` Step 2 (try Tier-1 indexer, fall back to `repo-indexing` skill).
- Produce new values for all structured fields.

**Before overwriting the context file:**
- If `userEdited: true` in the registry entry, diff the new indexed values against the current context frontmatter.
- If the diff is non-trivial (owns/endpoints/emits/consumes changed), show the diff and ask: "The indexed data for `<name>` has changed. Overwrite the `userEdited` context with new values? [y/N/show-diff]"
- If the user says N, preserve the existing content and set `userEdited: true`. Update only `fingerprint` and `lastIndexed`.
- If the user says Y, overwrite and set `userEdited: false`.

---

## Step 3b — Ingest manual frontmatter edits

For repos where the context file is newer than `lastIndexed`:
- Parse the YAML frontmatter from `.repo-orchestrator/context/<name>.md`.
- Update the matching fields in `registry.json` (`owns`, `endpoints`, `emits`, `consumes`, `dependsOn`, `providesTo`).
- Set `userEdited: true` on the registry entry.
- Do NOT overwrite prose sections — only the registry JSON.

---

## Step 4 — Refresh agent files if needed

For each re-indexed repo, compare the new `owns` and the derived agent description to the existing agent file. If materially different (owns list changed, or description would change), regenerate `.claude/agents/repo-<name>.md` from the template using the updated values.

---

## Step 5 — Validate and save registry

Validate the updated `registry.json` against `schemas/registry.schema.json`. Write it. Report:

```
Sync complete.

  auth-service    ✅ re-indexed (code drift detected)
  payments        ✅ frontmatter ingested (user edits)
  notifications   ⏭  up to date

Registry updated: .repo-orchestrator/registry.json
```
```

- [ ] **Step 4.3: Create `commands/edit-context.md`**

```
---
name: edit-context
description: "Open and guide editing of a repo's context file. Ingests frontmatter changes back into registry.json on completion."
---

# /edit-context <repo>

Open and guide editing of a specific repo's context document.

Usage: `/edit-context auth-service`

---

## Step 1 — Resolve the repo

Read `.repo-orchestrator/registry.json`. Find the entry with `name == <repo>`. If not found, list available names and stop.

Get the `contextFile` path (e.g., `.repo-orchestrator/context/auth-service.md`). If the file does not exist, stop: "Context file not found. Run `/init-context` first."

---

## Step 2 — Present the file

Read and display the current content of the context file.

Then offer guidance:

```
📄 Context file for <repo>: <contextFile>

Edit this file directly in your editor, or I can help you update specific sections.

Key fields for routing (in the YAML frontmatter):
  owns:      domain keywords — what problem areas does this repo own?
  endpoints: HTTP routes this repo exposes
  emits:     events this repo publishes
  consumes:  events this repo subscribes to

Ask me to update any section, e.g.:
  "Add 'oauth' to owns"
  "The /api/users endpoint was renamed to /api/v2/users"
  "We now consume the order.paid event"

When done editing, say "done" and I'll ingest the changes into the registry.
```

---

## Step 3 — Apply requested edits (if any)

If the user asks for specific changes, apply them to the context file:
- For frontmatter fields: parse the YAML, update the field, re-serialize.
- For prose sections: locate the heading and update the content.
- Always show the diff before writing: "I'll make these changes: [diff]. Proceed? [y/N]"

---

## Step 4 — Ingest on completion

When the user says "done" (or any affirmative indicating they're finished editing):

1. Parse the YAML frontmatter from the saved context file.
2. Update the matching fields in `.repo-orchestrator/registry.json`.
3. Set `userEdited: true` on this registry entry.
4. Validate the registry against `schemas/registry.schema.json`.
5. Save the registry.

Report: "✅ Context for `<repo>` ingested into registry. Run `/sync-context <repo>` to also refresh the agent file if owns/endpoints changed."
```

- [ ] **Step 4.4: Commit**

```bash
git add commands/init-context.md commands/sync-context.md commands/edit-context.md
git commit -m "feat: add init-context, sync-context, and edit-context commands"
```

---

## Task 5: Commands — `/triage` and `/deliberate`

**Files:**
- Create: `commands/triage.md`
- Create: `commands/deliberate.md`

- [ ] **Step 5.1: Create `commands/triage.md`**

```
---
name: triage
description: "Master controller: route a ticket to responsible repo specialists, have them deliberate, and return a single consolidated change plan. Propose-only — no files are modified."
---

# /triage <ticket>

Route a ticket or feature request to the responsible repo specialists and synthesise a consolidated change plan.

Usage: `/triage "Users are getting 401 errors after the recent auth refactor"`

**This command proposes only. No files are modified, no commits are made.**

Requires: Claude Code v2.1.32+ and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

---

## Step 1 — Load registry and route

Read `.repo-orchestrator/registry.json`. If not found, stop: "Registry not found. Run `/init-context` first."

Use the `routing` skill (`skills/routing/SKILL.md`) to select candidate repos. Cap at 5.

Print the routing decision (keywords extracted, candidates with scores).

If 0 candidates: stop and report "No responsible repo identified. Review the `owns` fields in `.repo-orchestrator/registry.json` or run `/sync-context`."

---

## Step 2 — Single-repo shortcut

If routing returns exactly 1 candidate with high confidence (score ≥ 4 or no other repo scored):
- Skip the Agent Team entirely.
- Spawn a single subagent using the candidate's `agentType`.
- Pass the full ticket text and instruct it to produce the standard report block.
- Jump to Step 5.

---

## Step 3 — Spawn Agent Team

For 2–5 candidates, spawn an **Agent Team** using the candidates' `agentType` values from the registry.

Set each teammate's system context to include:
- The full ticket text
- The registry entry for their repo (name, path, owns, endpoints, emits, consumes)
- Instruction to read their context file on startup
- Instruction to perform the VERDICT step first before any deep analysis
- Instruction to use the mailbox to deliberate with named teammates over cross-repo contracts
- Hard rule: propose only, never modify files

Enable `permissionMode: "plan"` for all teammates (read + delegate tools only — no write tools).

---

## Step 4 — Collect verdicts and deliberate

Wait for all teammates to emit their VERDICT line.

Drop any teammate whose verdict is `NOT_RESPONSIBLE` with confidence ≥ 80%.

Allow remaining specialists to deliberate via the mailbox over any cross-repo contracts they identified (changed endpoint shapes, event schema changes, shared DB fields, JWT claim changes).

Each specialist should acknowledge the other's concerns before finalising their report.

---

## Step 5 — Synthesise the plan

After all specialists have returned their report blocks, synthesise a single consolidated plan for the developer:

```
═══════════════════════════════════════════════════════════════
TRIAGE REPORT — <ticket summary>
Generated: <ISO8601 timestamp>
═══════════════════════════════════════════════════════════════

ROUTING
  Ticket keywords: <keywords>
  Responsible repos: <repo1>, <repo2>, ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST REPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Include each specialist's full report block here]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSOLIDATED CHANGE PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ordered steps (resolve cross-repo dependencies before dependents):

1. [repo-name] <change description>
   Files: <specific files to touch>
   Depends on: (none | step N completing first)

2. [repo-name] <change description>
   ...

CROSS-REPO CONTRACT CHANGES:
  <If any endpoint, event, or shared schema is changing, list it here with all affected repos>

RISKS:
  <Aggregated risks from all specialist reports>

VALIDATION:
  <Aggregated validation hints — how to test the complete change end-to-end>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  This is a PROPOSED PLAN only. No files have been modified.
    Review the plan, then execute the steps manually or with your team.
═══════════════════════════════════════════════════════════════
```

---

## Step 6 — Clean up the team

After the plan is delivered, release the Agent Team. The session returns to single-agent mode.
```

- [ ] **Step 5.2: Create `commands/deliberate.md`**

```
---
name: deliberate
description: "Adversarial multi-repo root-cause mode: spawn all repo specialists as an Agent Team, force them to challenge each other's assumptions, and surface the true cross-repo root cause of an incident."
---

# /deliberate <incident>

Run an adversarial multi-repo root-cause analysis. Use this when the cause of an incident is unclear and you need the specialists to challenge each other.

Usage: `/deliberate "Payments are failing intermittently — unknown root cause"`

**This command proposes only. No files are modified.**

Requires: Claude Code v2.1.32+ and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

---

## Difference from `/triage`

`/triage` routes to likely-responsible repos and has them deliberate over cross-repo contracts.

`/deliberate` is **adversarial**: it:
1. Involves ALL registered repos (not just routed candidates)
2. Requires each specialist to **challenge the others' hypotheses**
3. Forces explicit cross-examination via the mailbox before anyone is allowed to submit a final report
4. Is intended for incidents where the surface symptom is in one repo but the root cause may be anywhere

---

## Step 1 — Load all repos

Read `.repo-orchestrator/registry.json`. Gather all repo entries. If the registry has more than 8 repos, warn: "Deliberating across >8 repos will be expensive. Consider using `/triage` to narrow the scope first. Continue? [y/N]"

---

## Step 2 — Spawn all specialists as an Agent Team

Spawn all registered repo specialists as an Agent Team. Pass to each:
- The full incident description
- Instruction to read their context file on startup
- **Adversarial mode instruction:** "Before finalising your verdict, you MUST challenge at least one other specialist's hypothesis via the mailbox. If another specialist's proposed root cause would have implications for your repo, name the exact implication. If their hypothesis seems wrong given what you know about the contracts between your services, say so explicitly and explain why."
- Instruction to produce the standard VERDICT + report block
- Hard rule: propose only, never modify files

---

## Step 3 — Cross-examination phase

Require at least one round of mailbox cross-examination before accepting final reports. Specifically:
- Each specialist that is RESPONSIBLE or PARTIALLY_RESPONSIBLE must send at least one mailbox message to another specialist challenging or confirming a specific hypothesis.
- No specialist may submit a final report until they have either (a) received a response from any specialist they messaged, or (b) the team has completed a full exchange round.

---

## Step 4 — Synthesise adversarial root-cause report

After all specialists have submitted their reports:

```
═══════════════════════════════════════════════════════════════
DELIBERATION REPORT — <incident summary>
Generated: <ISO8601 timestamp>
Mode: ADVERSARIAL ROOT-CAUSE
═══════════════════════════════════════════════════════════════

INCIDENT: <incident text>

SPECIALISTS CONSULTED: <repo1>, <repo2>, ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY HYPOTHESES RAISED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Bullet list of hypotheses surfaced, with the specialist who raised them]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CROSS-EXAMINATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Summary of mailbox exchanges: who challenged whom, what was confirmed/refuted]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST REPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Each specialist's full report block]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROOT CAUSE ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Most likely root cause: <repo-name> — <description>
Confidence: <High|Medium|Low>
Basis: <what evidence from deliberation supports this>

Alternative hypotheses still open:
  - <hypothesis>: <why not conclusively ruled out>

REMEDIATION PLAN:
  [Ordered steps, same format as /triage consolidated plan]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  This is a PROPOSED PLAN only. No files have been modified.
═══════════════════════════════════════════════════════════════
```
```

- [ ] **Step 5.3: Commit**

```bash
git add commands/triage.md commands/deliberate.md
git commit -m "feat: add triage and deliberate commands (master controller)"
```

---

## Task 6: Hooks and examples

**Files:**
- Create: `hooks/hooks.json`
- Create: `examples/workspace-template/.claude/settings.json`

- [ ] **Step 6.1: Create `hooks/hooks.json`**

The hook uses Node.js for the check. It uses `continueOnError: true` so it silently skips on native-binary installs without Node.

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "command": "node -e \"const fs=require('fs');const p='.repo-orchestrator/registry.json';if(!fs.existsSync(p)){process.stdout.write('\\u26a0\\ufe0f  repo-orchestrator: No registry found.\\n   Run /init-context to bootstrap repo discovery and specialist agents.\\n');}\"",
      "description": "Warn if workspace has no registry yet. Silently skipped if node is unavailable.",
      "continueOnError": true
    }
  ]
}
```

- [ ] **Step 6.2: Create `examples/workspace-template/.claude/settings.json`**

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "experimental": {
    "teammateMode": true
  }
}
```

- [ ] **Step 6.3: Commit**

```bash
git add hooks/ examples/
git commit -m "feat: add SessionStart hook and workspace-template example"
```

---

## Task 7: Full README and CONTRIBUTING

**Files:**
- Modify: `README.md`
- Create: `CONTRIBUTING.md`

- [ ] **Step 7.1: Write full `README.md`**

Replace the skeleton README content with:

```markdown
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
```

- [ ] **Step 7.2: Create `CONTRIBUTING.md`**

```markdown
# Contributing to repo-orchestrator

Thank you for contributing! This guide covers the main extension points.

## Adding a Tier-1 language parser

The Tier-1 indexer (`indexer/src/index.ts`) uses regex-based extraction. To add support for a new language or framework:

1. Add detection logic in the `detectFrameworks()` function, checking the manifest for the framework's package name.
2. Add endpoint extraction patterns in `ENDPOINT_PATTERNS` for the framework's route registration syntax.
3. Add event extraction patterns in `EMIT_PATTERNS` / `CONSUME_PATTERNS` for the framework's pub/sub syntax.
4. Add a test fixture in `indexer/test/fixtures/<language>/` with a sample file and expected output.
5. Run `npm test` in `indexer/` and ensure the new tests pass.

## Testing commands

Commands are Markdown files that instruct Claude — they don't have unit tests in the traditional sense. To test a command:

1. Set up a sample workspace with 2–3 small git repos (even empty ones with a `package.json` work for basic routing tests).
2. Install the plugin locally: `/plugin install <path-to-repo-orchestrator>`.
3. Run the command you changed and verify the output matches the spec in `SPEC.md`.
4. For `/triage` and `/deliberate`, verify that the final report contains no file modifications.

## Code style

- **TypeScript (indexer, MCP):** ESLint with `@typescript-eslint`. Run `npm run lint`.
- **Markdown (commands, skills, agents):** No formatter enforced. Keep lines ≤ 120 chars where possible.
- **JSON (schemas, config):** 2-space indent. Validate by running `node -e "JSON.parse(require('fs').readFileSync('file.json','utf8'))"`.

## Pull request checklist

- [ ] `claude plugin validate .` passes
- [ ] Tier-1 indexer builds (`cd indexer && npm ci && npm run build`)
- [ ] Tier-2 MCP builds (`cd mcp && npm ci && npm run build`)
- [ ] `schemas/registry.schema.json` is valid JSON Schema
- [ ] README updated if behaviour changed
- [ ] No auto-apply, commit, push, or PR-opening behaviour added to any command or agent
```

- [ ] **Step 7.3: Commit**

```bash
git add README.md CONTRIBUTING.md
git commit -m "docs: add full README and CONTRIBUTING guide"
```

---

## Task 8: Tier-1 indexer (optional, Node/TS)

**Files:**
- Create: `indexer/package.json`
- Create: `indexer/tsconfig.json`
- Create: `indexer/src/index.ts`

- [ ] **Step 8.1: Create `indexer/package.json`**

```json
{
  "name": "@repo-orchestrator/indexer",
  "version": "0.1.0",
  "description": "Tier-1 fast deterministic indexer for repo-orchestrator",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "repo-index": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "lint": "eslint src/",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "dependencies": {
    "fast-glob": "^3.3.2",
    "simple-git": "^3.22.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 8.2: Create `indexer/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 8.3: Create `indexer/src/index.ts`**

The indexer must use `execFileSync` (not `exec`/`execSync` with shell interpolation) to avoid command injection. It takes a repo path as the first CLI argument.

```typescript
#!/usr/bin/env node
/**
 * Tier-1 deterministic indexer.
 * Usage: node dist/index.js <repoPath>
 * Output: JSON to stdout — { languages, frameworks, entryPoints, endpoints, emits, consumes, dependsOn, fileCount, fingerprint }
 * Exit code 0 on success, 1 on error (commands fall back to Tier-0 on any non-zero exit).
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import fg from 'fast-glob';
import { z } from 'zod';

// ── Output schema ────────────────────────────────────────────────────────────

const FactsSchema = z.object({
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  entryPoints: z.array(z.string()),
  endpoints: z.array(z.string()),
  emits: z.array(z.string()),
  consumes: z.array(z.string()),
  dependsOn: z.array(z.string()),
  fileCount: z.number(),
  fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

type Facts = z.infer<typeof FactsSchema>;

// ── Language detection ───────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python',
  '.cs': 'C#',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
};

function detectLanguages(files: string[]): string[] {
  const langs = new Set<string>();
  for (const f of files) {
    const lang = EXT_TO_LANG[extname(f)];
    if (lang) langs.add(lang);
  }
  return [...langs];
}

// ── Framework detection ──────────────────────────────────────────────────────

function detectFrameworks(repoPath: string): string[] {
  const frameworks: string[] = [];

  const pkgPath = join(repoPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps['@nestjs/core'] || allDeps['@nestjs/common']) frameworks.push('NestJS');
      if (allDeps['express']) frameworks.push('Express');
      if (allDeps['fastify']) frameworks.push('Fastify');
      if (allDeps['next']) frameworks.push('Next.js');
      if (allDeps['@hapi/hapi']) frameworks.push('Hapi');
      if (allDeps['koa']) frameworks.push('Koa');
      if (allDeps['prisma'] || allDeps['@prisma/client']) frameworks.push('Prisma');
      if (allDeps['typeorm']) frameworks.push('TypeORM');
    } catch { /* malformed package.json — skip */ }
  }

  const csprojFiles = fg.sync('*.csproj', { cwd: repoPath, deep: 1 });
  if (csprojFiles.length > 0) {
    try {
      const content = readFileSync(join(repoPath, csprojFiles[0]), 'utf8');
      if (content.includes('Microsoft.AspNetCore')) frameworks.push('ASP.NET Core');
    } catch { /* unreadable — skip */ }
  }

  const pomPath = join(repoPath, 'pom.xml');
  if (existsSync(pomPath)) {
    try {
      const content = readFileSync(pomPath, 'utf8');
      if (content.includes('spring-boot')) frameworks.push('Spring Boot');
    } catch { /* unreadable — skip */ }
  }

  const goModPath = join(repoPath, 'go.mod');
  if (existsSync(goModPath)) {
    try {
      const content = readFileSync(goModPath, 'utf8');
      if (content.includes('gin-gonic/gin')) frameworks.push('Gin');
      if (content.includes('labstack/echo')) frameworks.push('Echo');
      if (content.includes('gofiber/fiber')) frameworks.push('Fiber');
    } catch { /* unreadable — skip */ }
  }

  let pyContent = '';
  const pyprojectPath = join(repoPath, 'pyproject.toml');
  const requirementsPath = join(repoPath, 'requirements.txt');
  if (existsSync(pyprojectPath)) {
    try { pyContent = readFileSync(pyprojectPath, 'utf8'); } catch { /* skip */ }
  } else if (existsSync(requirementsPath)) {
    try { pyContent = readFileSync(requirementsPath, 'utf8'); } catch { /* skip */ }
  }
  if (pyContent.includes('fastapi')) frameworks.push('FastAPI');
  if (pyContent.includes('django')) frameworks.push('Django');
  if (pyContent.includes('flask')) frameworks.push('Flask');

  return frameworks;
}

// ── Endpoint extraction ──────────────────────────────────────────────────────

const ENDPOINT_PATTERNS: Array<{ re: RegExp; methodGroup: number; pathGroup: number }> = [
  { re: /(?:router|app)\.(get|post|put|patch|delete|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi, methodGroup: 1, pathGroup: 2 },
  { re: /@(Get|Post|Put|Patch|Delete|Head)\s*\(\s*['"`]([^'"`]*)['"`]/gi, methodGroup: 1, pathGroup: 2 },
  { re: /\[Http(Get|Post|Put|Patch|Delete)\s*\(\s*"([^"]+)"\s*\)\]/gi, methodGroup: 1, pathGroup: 2 },
  { re: /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*"([^"]+)"\s*\)/gi, methodGroup: 1, pathGroup: 2 },
  { re: /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi, methodGroup: 1, pathGroup: 2 },
  { re: /r\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*"([^"]+)"/gi, methodGroup: 1, pathGroup: 2 },
];

const METHOD_NORMALISE: Record<string, string> = {
  get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', delete: 'DELETE', head: 'HEAD',
  getmapping: 'GET', postmapping: 'POST', putmapping: 'PUT', deletemapping: 'DELETE', patchmapping: 'PATCH',
  httpget: 'GET', httppost: 'POST', httpput: 'PUT', httpdelete: 'DELETE', httppatch: 'PATCH',
};

function extractEndpoints(content: string): string[] {
  const endpoints = new Set<string>();
  for (const { re, methodGroup, pathGroup } of ENDPOINT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const method = METHOD_NORMALISE[m[methodGroup].toLowerCase()] ?? m[methodGroup].toUpperCase();
      const path = m[pathGroup] || '/';
      endpoints.add(`${method} ${path}`);
    }
  }
  return [...endpoints];
}

// ── Event extraction ─────────────────────────────────────────────────────────

const EMIT_PATTERNS: RegExp[] = [
  /(?:emit|publish|send|dispatch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /this\.eventEmitter\.emit\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /producer\.send\s*\(\s*\{[^}]*topic\s*:\s*['"`]([^'"`]+)['"`]/gi,
];

const CONSUME_PATTERNS: RegExp[] = [
  /(?:on|subscribe|consume|addListener)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /@OnEvent\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /consumer\.subscribe\s*\(\s*\{[^}]*topics\s*:\s*\[['"`]([^'"`]+)['"`]/gi,
];

function extractEvents(content: string): { emits: string[]; consumes: string[] } {
  const emits = new Set<string>();
  const consumes = new Set<string>();
  for (const p of EMIT_PATTERNS) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(content)) !== null) emits.add(m[1]);
  }
  for (const p of CONSUME_PATTERNS) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(content)) !== null) consumes.add(m[1]);
  }
  return { emits: [...emits], consumes: [...consumes] };
}

// ── Fingerprint ──────────────────────────────────────────────────────────────

function computeFingerprint(repoPath: string, fileCount: number): string {
  let headSha = 'no-git';
  try {
    headSha = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { /* not a git repo or git unavailable */ }

  const manifests = ['package.json', 'go.mod', 'pom.xml', 'pyproject.toml', 'Cargo.toml'];
  let manifestMtime = '0';
  for (const m of manifests) {
    const p = join(repoPath, m);
    if (existsSync(p)) {
      try { manifestMtime = String(statSync(p).mtimeMs); } catch { /* skip */ }
      break;
    }
  }

  const input = `${headSha}:${fileCount}:${manifestMtime}`;
  const hex = createHash('sha256').update(input).digest('hex');
  return `sha256:${hex}`;
}

// ── Entry points detection ───────────────────────────────────────────────────

const ENTRY_PATTERNS = [
  'src/main.*', 'src/index.*', 'cmd/main.*',
  'app.*', 'server.*', 'index.*', 'main.*',
];

async function findEntryPoints(repoPath: string): Promise<string[]> {
  const found: string[] = [];
  for (const pattern of ENTRY_PATTERNS) {
    const matches = await fg(pattern, { cwd: repoPath, deep: 1, absolute: false });
    found.push(...matches.filter(f => !f.includes('test') && !f.includes('spec')));
    if (found.length >= 3) break;
  }
  return found.slice(0, 3);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repoPath = process.argv[2];
  if (!repoPath) {
    process.stderr.write('Usage: node dist/index.js <repoPath>\n');
    process.exit(1);
  }

  if (!existsSync(repoPath)) {
    process.stderr.write(`Path does not exist: ${repoPath}\n`);
    process.exit(1);
  }

  const allFiles = await fg('**/*', {
    cwd: repoPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/vendor/**', '**/__pycache__/**'],
    dot: false,
    onlyFiles: true,
  });

  const languages = detectLanguages(allFiles);
  const frameworks = detectFrameworks(repoPath);
  const entryPoints = await findEntryPoints(repoPath);

  const interestingPatterns = [
    '**/*.routes.*', '**/*.controller.*', '**/*.handler.*', '**/router.*',
    '**/*.events.*', '**/events.*', '**/*.pubsub.*',
    ...entryPoints,
  ];
  const interestingFiles = await fg(interestingPatterns, {
    cwd: repoPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    onlyFiles: true,
    deep: 5,
  });

  const endpoints: string[] = [];
  const emitSet = new Set<string>();
  const consumeSet = new Set<string>();

  for (const relFile of interestingFiles.slice(0, 10)) {
    try {
      const content = readFileSync(join(repoPath, relFile), 'utf8');
      endpoints.push(...extractEndpoints(content));
      const { emits, consumes } = extractEvents(content);
      emits.forEach(e => emitSet.add(e));
      consumes.forEach(e => consumeSet.add(e));
    } catch { /* unreadable file — skip */ }
  }

  const fingerprint = computeFingerprint(repoPath, allFiles.length);

  const facts: Facts = FactsSchema.parse({
    languages,
    frameworks,
    entryPoints,
    endpoints: [...new Set(endpoints)],
    emits: [...emitSet],
    consumes: [...consumeSet],
    dependsOn: [],
    fileCount: allFiles.length,
    fingerprint,
  });

  process.stdout.write(JSON.stringify(facts, null, 2) + '\n');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
```

- [ ] **Step 8.4: Commit**

```bash
git add indexer/
git commit -m "feat: add Tier-1 TypeScript indexer (optional, Node 18+)"
```

---

## Task 9: Tier-2 MCP server (optional)

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/src/server.ts`

- [ ] **Step 9.1: Create `mcp/package.json`**

```json
{
  "name": "@repo-orchestrator/mcp-server",
  "version": "0.1.0",
  "description": "Tier-2 optional MCP server for repo-orchestrator — exposes registry as live tools",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 9.2: Create `mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 9.3: Create `mcp/src/server.ts`**

```typescript
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

type RepoEntry = { name: string; agentType: string; languages: string[]; owns: string[]; endpoints: string[]; emits: string[]; consumes: string[] };
type Registry = { repos: Array<Record<string, unknown>>; generatedAt: string };

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
  const idx = registry.repos.findIndex(r => r['name'] === name);
  if (idx === -1) throw new Error(`Repo "${name}" not found in registry.`);
  registry.repos[idx] = { ...registry.repos[idx], ...patch, userEdited: true };
  saveRegistry(registry);
  return `Updated repo "${name}" in registry.`;
}

function handleRegisterAgent(args: unknown): string {
  const { entry } = RegisterEntrySchema.parse(args);
  const registry = loadRegistry() as Registry;
  const name = entry['name'] as string;
  const idx = registry.repos.findIndex(r => r['name'] === name);
  if (idx >= 0) {
    registry.repos[idx] = entry as Record<string, unknown>;
  } else {
    registry.repos.push(entry as Record<string, unknown>);
  }
  registry.generatedAt = new Date().toISOString();
  saveRegistry(registry);
  return `Registered agent for repo "${name}".`;
}

function handleFindOwningRepos(args: unknown): string {
  const { keywords } = FindKeywordsSchema.parse(args);
  const lower = keywords.map(k => k.toLowerCase());
  const registry = loadRegistry() as { repos: RepoEntry[] };
  const results = registry.repos
    .map(r => {
      let score = 0;
      const fields = [...r.owns, ...r.endpoints, ...r.emits, ...r.consumes].map(s => s.toLowerCase());
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

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
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
```

- [ ] **Step 9.4: Commit**

```bash
git add mcp/
git commit -m "feat: add Tier-2 optional MCP server (list_repos, get_repo_context, find_owning_repos, ...)"
```

---

## Task 10: Automation runner

**Files:**
- Create: `automation/triage_runner.mjs`

- [ ] **Step 10.1: Create `automation/triage_runner.mjs`**

```javascript
/**
 * automation/triage_runner.mjs
 *
 * Agent SDK headless runner. Loads the repo-orchestrator plugin by local path,
 * runs the /triage flow on a ticket from argv/stdin, captures the final plan,
 * and exposes a runTriage() function a GitHub/Jira webhook handler can call.
 *
 * Usage (CLI):
 *   CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 \
 *   node automation/triage_runner.mjs "Users are getting 401 errors after auth refactor"
 *
 * Usage (programmatic):
 *   import { runTriage } from './automation/triage_runner.mjs';
 *   const plan = await runTriage({ ticket: '...', workspaceRoot: '/path/to/workspace' });
 *
 * Pin the SDK version in the package.json of the caller and verify the
 * Agent constructor options against the installed @anthropic-ai/claude-code docs.
 */

import { Agent } from '@anthropic-ai/claude-code';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLUGIN_ROOT = resolve(__dirname, '..');
const DEFAULT_MODEL = 'claude-opus-4-7';

/**
 * Run the /triage flow headlessly on a ticket string.
 *
 * @param {object} opts
 * @param {string} opts.ticket - The ticket text to triage.
 * @param {string} [opts.workspaceRoot] - Workspace root. Defaults to process.cwd().
 * @param {string} [opts.model] - Claude model ID. Defaults to claude-opus-4-7.
 * @returns {Promise<string>} The final triage plan text.
 */
export async function runTriage({ ticket, workspaceRoot, model }) {
  const cwd = workspaceRoot ?? process.cwd();
  const resolvedModel = model ?? DEFAULT_MODEL;

  const registryPath = resolve(cwd, '.repo-orchestrator', 'registry.json');
  try {
    readFileSync(registryPath, 'utf8');
  } catch {
    throw new Error(`Registry not found at ${registryPath}. Run /init-context in the workspace first.`);
  }

  const agent = new Agent({
    model: resolvedModel,
    permissionMode: 'plan',
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'Agent'],
    cwd,
    env: {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    },
    plugins: [
      {
        localPath: PLUGIN_ROOT,
      },
    ],
    systemPrompt: [
      'You are a headless triage runner for the repo-orchestrator plugin.',
      'You will receive a single ticket. Run /triage on it and return the complete triage report.',
      'Do not ask clarifying questions. Do not modify any files. Output the final plan and nothing else.',
      `Workspace root: ${cwd}`,
    ].join('\n'),
  });

  const planChunks = [];
  for await (const event of agent.stream(`/triage ${JSON.stringify(ticket)}`)) {
    if (event.type === 'text') {
      planChunks.push(event.text);
    }
  }

  return planChunks.join('');
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ticket = process.argv.slice(2).join(' ');
  if (!ticket) {
    process.stderr.write('Usage: node automation/triage_runner.mjs "<ticket text>"\n');
    process.exit(1);
  }

  try {
    const plan = await runTriage({ ticket });
    process.stdout.write(plan + '\n');
  } catch (err) {
    process.stderr.write(`Error: ${String(err)}\n`);
    process.exit(1);
  }
}
```

- [ ] **Step 10.2: Commit**

```bash
git add automation/triage_runner.mjs
git commit -m "feat: add Agent SDK headless triage runner (propose-only, plan mode)"
```

---

## Task 11: End-to-end validation

- [ ] **Step 11.1: Verify file structure matches spec §4a**

Run from the repo root and confirm each of these paths exists:

```
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
skills/repo-indexing/SKILL.md
skills/routing/SKILL.md
agents/repo-specialist-template.md
commands/init-context.md
commands/sync-context.md
commands/edit-context.md
commands/triage.md
commands/deliberate.md
hooks/hooks.json
schemas/registry.schema.json
schemas/context-template.md
indexer/package.json
indexer/tsconfig.json
indexer/src/index.ts
mcp/package.json
mcp/tsconfig.json
mcp/src/server.ts
automation/triage_runner.mjs
examples/workspace-template/.claude/settings.json
LICENSE
CONTRIBUTING.md
README.md
.github/workflows/validate.yml
```

- [ ] **Step 11.2: Validate all JSON files parse without error**

Run:

```powershell
node -e "
  const fs = require('fs');
  const files = [
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    'schemas/registry.schema.json',
    'hooks/hooks.json',
    'examples/workspace-template/.claude/settings.json',
    'indexer/package.json',
    'mcp/package.json',
  ];
  let ok = true;
  for (const f of files) {
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'));
      console.log('OK', f);
    } catch (e) {
      console.error('FAIL', f, e.message);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
"
```

Expected: every file prints `OK`.

- [ ] **Step 11.3: Verify registry schema has required top-level fields**

```powershell
node -e "
  const schema = JSON.parse(require('fs').readFileSync('schemas/registry.schema.json', 'utf8'));
  const required = ['\$schema', 'properties', 'required'];
  for (const f of required) {
    if (!schema[f]) { console.error('Missing field:', f); process.exit(1); }
  }
  console.log('registry.schema.json OK');
"
```

Expected: `registry.schema.json OK`.

- [ ] **Step 11.4: Build and smoke-test the Tier-1 indexer**

```powershell
cd indexer
npm install
npm run build
node dist/index.js ..
```

Expected: JSON printed to stdout with `languages`, `frameworks`, `fingerprint` fields. Exit code 0.

- [ ] **Step 11.5: Verify automation runner exports `runTriage`**

```powershell
node --input-type=module -e "
  import('./automation/triage_runner.mjs').then(m => {
    if (typeof m.runTriage !== 'function') {
      console.error('runTriage export missing');
      process.exit(1);
    }
    console.log('automation/triage_runner.mjs OK');
  });
"
```

Expected: `automation/triage_runner.mjs OK`.

- [ ] **Step 11.6: Final commit**

```bash
git add -A
git commit -m "chore: implementation complete — all tiers, docs, CI"
```

---

## Spec coverage check

| SPEC.md section | Covered by |
|---|---|
| §1 Mission (master, routing, deliberation, propose-only) | Tasks 4–5 (init-context, triage, deliberate) |
| §1 Onboarding with editable context + pause checkpoint | Task 4 (init-context Step 4) |
| §2 Plugin format, Agent Teams, read-only via tools allowlist | Task 1 (plugin.json), Task 2 (specialist template) |
| §2 Zero-dep Tier-0 path | Tasks 3–5 (prompt-driven, no Node required) |
| §3 Three-tier with feature detection | Tasks 8–9 (Tier-1, Tier-2 optional with fallback) |
| §4a Plugin file layout | All tasks |
| §4b Workspace layout (generated artifacts in user workspace) | Tasks 4–5 (init-context generates .claude/agents/, registry.json) |
| §5a registry.json + JSON Schema | Task 2 (registry.schema.json) |
| §5b context-template.md | Task 2 |
| §5c config.json discovery (auto + list modes) | Task 4 (init-context Step 1) |
| §6 Commands exact behavior | Tasks 4–5 |
| §7 Specialist template (VERDICT, report block, hard rules, hook note) | Task 2 (repo-specialist-template.md) |
| §8 Tier-1 indexer (TS, fast-glob, zod, execFileSync safe) | Task 8 |
| §9 Tier-2 MCP server (5 tools) | Task 9 |
| §10 Automation runner (Agent SDK, permissionMode: plan) | Task 10 |
| §11 Packaging, CI, docs, license | Tasks 1, 7 |
| §12 Acceptance criteria | Task 11 (validation checks) |
| §13 Build order | Tasks 1–10 match §13 exactly |
