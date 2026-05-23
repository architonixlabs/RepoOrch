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
