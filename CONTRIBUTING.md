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
