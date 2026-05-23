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
 * SDK: @anthropic-ai/claude-agent-sdk — pin the version in your package.json.
 * Plugin-loading option shape verified against Agent SDK docs (agent-sdk/plugins).
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLUGIN_ROOT = resolve(__dirname, '..');
const DEFAULT_MODEL = 'claude-opus-4-5';

/**
 * Run the /triage flow headlessly on a ticket string.
 *
 * @param {object} opts
 * @param {string} opts.ticket - The ticket text to triage.
 * @param {string} [opts.workspaceRoot] - Workspace root. Defaults to process.cwd().
 * @param {string} [opts.model] - Claude model ID. Defaults to claude-opus-4-5.
 * @returns {Promise<string>} The final triage plan text.
 */
export async function runTriage({ ticket, workspaceRoot, model }) {
  if (!ticket || !ticket.trim()) {
    throw new Error('runTriage: ticket must be a non-empty string.');
  }

  const cwd = workspaceRoot ?? process.cwd();
  const resolvedModel = model ?? DEFAULT_MODEL;

  const registryPath = resolve(cwd, '.repo-orchestrator', 'registry.json');
  try {
    readFileSync(registryPath, 'utf8');
  } catch {
    throw new Error(`Registry not found at ${registryPath}. Run /init-context in the workspace first.`);
  }

  let plan = '';
  for await (const message of query({
    prompt: `/triage ${ticket}`,
    options: {
      model: resolvedModel,
      permissionMode: 'plan',
      allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Agent'],
      cwd,
      env: {
        ...process.env,
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      },
      plugins: [
        { type: 'local', path: PLUGIN_ROOT },
      ],
      systemPrompt: [
        'You are a headless triage runner for the repo-orchestrator plugin.',
        'You will receive a single ticket. Run /triage on it and return the complete triage report.',
        'Do not ask clarifying questions. Do not modify any files. Output the final plan and nothing else.',
        `Workspace root: ${cwd}`,
      ].join('\n'),
    },
  })) {
    if ('result' in message) {
      plan = message.result;
      break;
    }
  }

  return plan;
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
