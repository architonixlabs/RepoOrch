---
project_name: 'RepoOrch (repo-orchestrator)'
user_name: 'ramcsamal'
date: '2026-06-14'
sections_completed: ['technology_stack', 'language_specific', 'framework_specific', 'testing', 'code_quality', 'workflow', 'anti_patterns']
status: 'complete'
rule_count: 45
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

**Runtime/Language:** Node `>=18`, TypeScript `^5.3.0`. **All packages are ESM** (`"type": "module"`).
tsconfig: `target ES2022`, `strict: true`, `isolatedModules: true`, `rootDir src` → `outDir dist`. **Module resolution differs per package:** `indexer/` uses `module ESNext` + `moduleResolution "bundler"`; `mcp/` uses `module Node16` + `moduleResolution Node16` (so `.js` import extensions are enforced by `tsc` there, not only at runtime).

**Monorepo-by-convention** — four independent packages, each built with its own `tsc` (no root workspace, no project references):

| Package | Name / version | Key deps | Purpose |
|---|---|---|---|
| `indexer/` | `@repo-orchestrator/indexer` 0.1.0 | `fast-glob ^3.3.2`, `zod ^3.22.4` | Tier-1 deterministic indexer → facts/summary.json |
| `mcp/` | `@repo-orchestrator/mcp-server` 0.1.0 | `@modelcontextprotocol/sdk ^1.0.0`, `zod ^3.22.4` | Tier-2 MCP server over registry.json |
| `setup/` | `@repo-orchestrator/setup` 0.2.4 | `@clack/prompts ^0.7`, `chalk ^5`, `execa ^8`; esbuild (bundler) | TTY-aware setup wizard, shipped as a committed bundle |
| `automation/` | `repo-orchestrator-triage-runner` 0.1.0 | `@anthropic-ai/claude-agent-sdk` **0.2.111 (pinned, exact)** | Headless triage runner |

**Test/lint (all four packages, enforced in CI):** `indexer/`, `mcp/`, `setup/` use jest `^29` (ESM) + `ts-jest ^29` + ESLint `^8`/`@typescript-eslint ^6`; `automation/` (plain `.mjs`, no build) uses jest `^29` + plain ESLint `^8`. Tests run via `node --experimental-vm-modules node_modules/jest/bin/jest.js` (cross-platform — `.bin/jest` breaks under bare `node` on Windows).

**Version & module gotchas (agents miss these):**
- `@anthropic-ai/claude-agent-sdk` is **pinned to exactly `0.2.111`** — never bump, never add `^`.
- `chalk ^5` / `ora ^8` / `execa ^8` are **ESM-only** — never `require()` them, including from CJS jest config files. `zod` stays on the **v3** API (not v4).
- `@modelcontextprotocol/sdk ^1.0.0` is a young 1.x on a caret — a minor bump can move the API; treat `npm install` breakage as expected and verify after upgrades.
- **`.js` import extensions are mandatory at runtime.** `moduleResolution "bundler"` lets `tsc` accept extensionless relative imports, but packages run under plain `node`, whose ESM loader throws `ERR_MODULE_NOT_FOUND` without them. When adding files, **always write `import { x } from './foo.js'`** even though the compiler doesn't force it. (Open refactor question: whether `"bundler"` resolution is even appropriate for `node`-executed output.)
- **Packages are islands — no cross-package imports.** Each installs and builds independently; `declaration: true` emits `.d.ts` but nothing is wired together. Do not import from another package's source or `dist`.
- **ESM jest mocking:** under `--experimental-vm-modules`, classic `jest.mock()` does not hoist — use `jest.unstable_mockModule()` + dynamic `import()`.

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **zod is the validation boundary, not decoration.** All external/persisted JSON (registry.json, indexer facts/summary.json, MCP tool args) is parsed through a zod schema before use. Never read `JSON.parse(...)` straight into typed code — pipe it through the schema.
- **Derive types from schemas, don't hand-write them** — but `z.input` and `z.output` are *different types* and diverge whenever a field has `.default()` or a transform. Use `z.input<typeof S>` for the write/argument path and `z.output<typeof S>` (= `z.infer`) for parsed results. If a schema and an interface disagree, the schema wins.
- **The registry carries a `version` field: parse-then-migrate, never reject.** When a stored `registry.json` fails to parse because it predates a schema change, run a migration keyed off `version` — do not discard or overwrite it.
- **`safeParse` must have teeth.** Reserve `.parse()` (throws) for true invariants. Where you `safeParse`, you MUST handle `!result.success` explicitly — log, migrate, or return a structured error. A swallowed validation failure is worse than a throw.
- **MCP tool handlers catch zod errors and map them to a structured tool error** — never let `.parse()` throw a raw `ZodError` across the protocol boundary.
- **`strict: true` everywhere — no `any`.** Use `unknown` + a zod parse at the edge, or a proper generic. No `// @ts-ignore` to silence strictness.
- **Top-level `await` is allowed** (ES2022 + Node ≥18 ESM) — don't wrap entrypoints in an async IIFE to "enable" await.

### Framework-Specific Rules

**This repo IS a Claude Code plugin** (`.claude-plugin/plugin.json` + `marketplace.json`):
- Components live in `commands/`, `skills/`, `agents/`, `hooks/`. Command files are kebab-case markdown with frontmatter (`repo-orch-*.md`); skills are `SKILL.md`.
- Use `${CLAUDE_PLUGIN_ROOT}` for paths in hooks/commands — but it **only exists in the plugin runtime**. The standalone CLI (`setup/`) and `automation/` runner will NOT have it; don't reference it there.

**MCP server (Tier-2, `mcp/`):**
- **Never `console.log` in the MCP server — stdout IS the JSON-RPC channel.** All logging goes to **stderr**. A single stray stdout line corrupts the protocol.
- stdio transport. Every tool's args are a zod schema; handlers `loadRegistry()` / `saveRegistry()` against `registry.json`.
- **Tool results must be content arrays** (`{ type: "text", ... }`), never raw objects.
- The MCP server is **optional** — degrade to Tier-1/Tier-0 if absent. Never assume it's running.

**Claude Agent SDK (headless triage runner, `automation/`):**
- **Propose-only is enforced per-surface — and `permissionMode: 'plan'` does NOT gate plugin agents.** Per Claude Code design, plan-mode has no effect on plugin-provided agents (see `agents/repo-specialist-template.md`); those are gated by the **`tools` allowlist** (`Read, Grep, Glob, Bash`) **+** the **`PreToolUse` write-block hook** in `hooks/hooks.json`. The headless Agent SDK runner (`automation/`) *does* honor `permissionMode: 'plan'`. MCP tool side effects are gated by neither — use `REPO_ORCH_READONLY`. Don't remove a layer that's load-bearing for its surface; agents emit a plan, never apply it.
- **Auth: feature-detect, never throw, never prompt.** If running inside a Claude Code session → use that session; if a standalone key is present → use it; **if neither → skip gracefully with a notice** (this is the default branch, not an error branch). Missing auth must NEVER produce a stack trace or a key prompt.
- The session-reuse mechanism must be **explicit in code**, not silently inherited from ambient env (avoid an unaudited credential-propagation path).

**Registry & CLI:**
- **`registry.json` writes must be atomic** (write temp file + rename) in addition to the existing backup — concurrent commands corrupt it otherwise. Respect the `userEdited` guard before overwriting on sync.
- CLI progress via `listr2` + `ora` + `chalk`; shell-outs via `execa` (never `child_process` directly).

### Testing Rules

**Ethos: determinism is enforced, not assumed — normalize, sort, and test the property, not the artifact.**

- **Tests live in `indexer/` and `mcp/`** (jest `^29` + `ts-jest ^29`, ESM). `mcp/` has a working `jest.config.mjs` and a registry schema-parity test; `setup/` and `automation/` have no tests — don't assume a test command exists there.
- **Run via the package script** (`node --experimental-vm-modules node_modules/.bin/jest`), not bare `jest` — ESM support depends on that flag. ESM mocking uses `jest.unstable_mockModule()` + dynamic `import()`; classic `jest.mock()` does not hoist.
- **Never freeze a literal fingerprint** in a test (it's a snapshot in disguise). Assert the two properties that matter: **stability** (same input → same hash, twice) and **sensitivity** (change one byte → hash changes).
- **Cross-platform determinism is the #1 risk: dev is Windows, CI is `ubuntu-latest`.** Before fingerprinting or asserting, **normalize line endings** (Git autocrlf gives CRLF locally, LF in CI — same file, different hash) and **normalize path separators** (fast-glob yields `/`, but `path.join` injects `\` on Windows).
- **Force LF on fixtures via `.gitattributes`** so fake-repo bytes don't mutate on checkout. Fixtures are tiny in-tree fake repos, versioned — never the real codebase.
- **Sort fast-glob output before hashing/asserting** — its ordering is not guaranteed; unsorted input causes flaky failures.
- `test/` is excluded from `tsc` (tsconfig `exclude`) — tests don't ship in `dist/`.
- **Schema-drift guard (implemented):** `mcp/test/registry-schema.test.ts` asserts the zod `RegistrySchema` and `schemas/registry.schema.json` reach the same verdict over good/bad fixtures (via ajv). Edit one schema without the other → red CI. Run with `npm test` in `mcp/`. Note: date `format` is not asserted (ajv `validateFormats:false`); zod mirrors this with plain-string dates.

### Code Quality & Style Rules

- **Naming:** command files are kebab-case `repo-orch-*.md`; skills are `SKILL.md` in a named skill dir; zod schemas & types are `PascalCase` (`FactsSchema`, `RepoEntry`), functions `camelCase`, pattern constants `SCREAMING_SNAKE` (`ENDPOINT_PATTERNS`).
- **Registry shape exists in two places, kept in parity by a test.** `schemas/registry.schema.json` (the external JSON Schema contract) and the zod `RegistrySchema`/`RepoEntrySchema` in `mcp/src/registry.ts` (the runtime validator). They are NOT hand-synced silently — the schema-drift test fails if they diverge. Registry writes (`register_agent`, `update_repo_context`) validate through the zod schema; never reintroduce `z.record(z.unknown())` for entries.
- **Separate by concern when a file mixes pure logic with side effects.** Not "flat until earned" — `indexer/src/index.ts` already mixes pure extractors (`detectLanguages`, `extractEndpoints`, …) with fs/registry I/O and should be split along that seam. Keep extraction pure; push side effects (fs, registry writes) to the edges.
- **All four packages are linted and tested in CI.** TS packages (`indexer/`, `mcp/`, `setup/`) use `@typescript-eslint` + ts-jest; `automation/` uses plain ESLint + jest over `.mjs`. **Pure logic is extracted into side-effect-free modules** (`indexer/src/paths.ts`, `mcp/src/policy.ts`, `setup/src/lib.ts`, `automation/validate.mjs`) so entry files that run on import (`index.ts`, `triage_runner.mjs`) can be tested without executing their main flow.
- **Comments only for the non-obvious** (the "why", a workaround, an invariant). Match surrounding density; no narrating-the-obvious.

### Development Workflow Rules

- **Commits use Conventional Commits** (`feat:`, `fix:`, `docs:`, …) — matches existing history.
- **Never add a `Co-Authored-By: Claude` (or any AI co-author) trailer to commits.** The author does not want Claude listed as a contributor.
- **Branching:** work off `master`; PRs target `main`. Don't commit straight to `main`.
- **Two distribution models.** `setup/` ships a **committed, self-contained esbuild bundle** at `setup/dist/index.js` (ESM with a `createRequire` banner so `execa`/`cross-spawn`'s `require('child_process')` resolves) — so the accelerator runs on a fresh install with only `node`. Rebuild with `npm run build` (= `tsc --noEmit && esbuild …`) and **re-commit the bundle** on any `setup/src` change. By contrast, `indexer/dist` and `mcp/dist` stay **gitignored / build-on-install** (the setup runner or `/repo-orch-setup` runs `npm install && npm run build` for them). Building needs a toolchain but **no API key**. The primary install path is Claude-native and needs no build at all — the bundle is only an optional accelerator.
- **Canonical version is `.claude-plugin/plugin.json`** (currently `0.3.0`). The four package versions are internal — on release, bump `plugin.json`, not the package versions, unless a package is independently published.
- **Add `graphify-out/` to `.gitignore`.** It's regenerated (and a post-commit hook rebuilds it every commit); leaving it untracked-but-unignored makes `git status` perpetually noisy.
- **CI is `.github/workflows/validate.yml` on `ubuntu-latest`** — must pass cross-platform; never rely on Windows-only path/line-ending behavior (see Testing rules).
- **After changing code, run `graphify update .`** to keep `graphify-out/graph.json` current (AST-only, no API cost). For codebase questions, query the graph first (`graphify query/path/explain`) before raw grep — already in root `CLAUDE.md`.

### Critical Don't-Miss Rules (anti-patterns)

- **NEVER apply edits in triage/deliberate flows.** The orchestrator is propose-only: it emits a change plan, a human applies it. Adding `Write`/`Edit` to a triage agent, or removing any of the three safety layers, breaks the core safety contract.
- **MCP tool side effects are gated by neither the `tools` allowlist, the `PreToolUse` hook, nor `permissionMode`.** Enforced via **`REPO_ORCH_READONLY`** (`mcp/src/policy.ts`): when set (`1`/`true`), the server only advertises/serves the read tools and rejects `register_agent`/`update_repo_context`. **Plan-mode / triage contexts must launch the MCP server with `REPO_ORCH_READONLY=1`** — nothing else contains MCP writes.
- **NEVER prompt for or hard-fail on a missing API key.** Knowledge building works on the existing session with no key (by design). BUT distinguish **expected absence** ("no auth present" → degrade gracefully with a notice) from **real failure** ("auth present but the call failed" → surface loudly). Don't hide bugs behind the friendly notice.
- **NEVER `console.log` in the MCP server** — stdout is the JSON-RPC channel; logs go to stderr.
- **NEVER write `registry.json` non-atomically or without the backup + `userEdited` guard** — it's the single source of truth; a torn write or clobbered user edit poisons every repo's routing.
- **NEVER trust the registry/facts JSON without a zod parse**, and never leave a `safeParse` failure unhandled.
- **NEVER assume Tier-2 (MCP) or Tier-1 (indexer) is present.** Always degrade to the lower tier; the system must work at Tier-0 (skill only).
- **NEVER write extensionless relative imports** (Node ESM runtime needs `.js`) or `require()` an ESM-only dep.
- **NEVER bump `@anthropic-ai/claude-agent-sdk`** off the pinned `0.2.111`.

**Security (the untrusted surface is bigger than it looks):**
- **The untrusted input is the entire indexed corpus, not just ticket text.** Any repo file (README, code comments) whose content reaches an agent prompt is a prompt-injection vector — keep the injection guard; never strip it.
- **Routing-poisoning guard (implemented):** the routing arrays (`owns`, `endpoints`, `emits`, `consumes`) are bounded at `maxItems: 100` in both `registry.schema.json` and the zod schema, enforced on every registry write. `find_owning_repos` ranks by match count, so the cap limits keyword-stuffing to hijack routing. Keep self-declared ownership advisory; don't raise the cap without reason.
- **Path-traversal / symlink safety (implemented in indexer):** all globs set `followSymbolicLinks: false`, and every read goes through `safeReadFile`/`resolveWithinRoot` (`indexer/src/paths.ts`), which realpath-resolve and reject anything escaping the repo root via `../` or symlink. Keep new file reads on that path; don't `readFileSync(join(repoRoot, x))` directly.
- **Secrets: index names, never values.** Env var *names* are fine; never capture values or `.env` contents into the graph or registry — it would become a searchable secret store.

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code in this repo.
- Follow ALL rules exactly; when in doubt, prefer the more restrictive option.
- The propose-only safety model and the "never prompt/fail on missing key" rules are non-negotiable.

**For Humans:**
- Keep this file lean and focused on what agents miss — not a general README.
- Update when the technology stack or safety model changes; remove rules that become obvious.
- Items flagged "follow-up issue" in the Don't-Miss section (corpus-wide injection surface, routing-poisoning guard, MCP-tool read-only enforcement) are real hardening tasks, not just documentation.
