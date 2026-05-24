/**
 * automation/triage_runner.mjs
 *
 * Agent SDK headless runner. Loads the repo-orchestrator plugin by local path,
 * runs the /triage flow on a ticket from argv/stdin, captures the final plan,
 * and exposes a runTriage() function a GitHub/Jira webhook handler can call.
 *
 * Usage (CLI):
 *   CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 \
 *   node automation/triage_runner.mjs "Users getting 401 errors after auth refactor"
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
const DEFAULT_MODEL = 'claude-opus-4-7';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Run the /triage flow headlessly on a ticket string.
 *
 * @param {object} opts
 * @param {string} opts.ticket - The ticket text to triage.
 * @param {string} [opts.workspaceRoot] - Workspace root. Defaults to process.cwd().
 * @param {string} [opts.model] - Claude model ID. Defaults to claude-opus-4-7.
 * @param {number} [opts.timeoutMs] - Timeout in ms. Defaults to 300000 (5 min). Use 0 to disable.
 * @returns {Promise<string>} The final triage plan text.
 */
export async function runTriage({ ticket, workspaceRoot, model, timeoutMs }) {
  if (!ticket || !ticket.trim()) {
    throw new Error('runTriage: ticket must be a non-empty string.');
  }

  const cwd = workspaceRoot ?? process.cwd();
  const resolvedModel = model ?? DEFAULT_MODEL;
  const resolvedTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const registryPath = resolve(cwd, '.repo-orchestrator', 'registry.json');
  try {
    readFileSync(registryPath, 'utf8');
  } catch {
    throw new Error(`Registry not found at ${registryPath}. Run /repo-orch-init in the workspace first.`);
  }

  const runQuery = async () => {
    let plan = '';
    for await (const message of query({
      prompt: `/repo-orch-triage ${ticket}`,
      options: {
        model: resolvedModel,
        permissionMode: 'plan',
        allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Agent'],
        cwd,
        env: {
          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
        },
        plugins: [
          { type: 'local', path: PLUGIN_ROOT },
        ],
        // Use the claude_code preset so tool guidance and safety rules are preserved.
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: [
            'You are a headless triage runner for the repo-orchestrator plugin.',
            'You will receive a single ticket. Run /repo-orch-triage on it and return the complete triage report.',
            'IMPORTANT: Do not ask clarifying questions under any circumstances — proceed with best-effort routing even if the ticket text is brief.',
            'Do not modify any files. Output the final plan and nothing else.',
            `Workspace root: ${cwd}`,
          ].join('\n'),
        },
      },
    })) {
      if (message.type === 'result') {
        if ('result' in message) {
          plan = message.result;
        } else {
          throw new Error(`Agent failed (${message.subtype}): ${message.errors?.join('; ') ?? 'unknown error'}`);
        }
        break;
      }
    }
    return plan;
  };

  if (resolvedTimeout === 0) return runQuery();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(
        `runTriage timed out after ${resolvedTimeout}ms. ` +
        'The routing skill may have asked a clarifying question or the model is unresponsive. ' +
        'Pass a longer timeoutMs, or set timeoutMs: 0 to disable the timeout.'
      )),
      resolvedTimeout
    )
  );

  return Promise.race([runQuery(), timeoutPromise]);
}

/**
 * Run the /repo-orch-deliberate flow headlessly on an incident string.
 *
 * @param {object} opts
 * @param {string} opts.incident - The incident text to deliberate on.
 * @param {string} [opts.workspaceRoot] - Workspace root. Defaults to process.cwd().
 * @param {string} [opts.model] - Claude model ID. Defaults to claude-opus-4-7.
 * @param {number} [opts.timeoutMs] - Timeout in ms. Defaults to 600000 (10 min). Use 0 to disable.
 * @returns {Promise<string>} The final deliberation report text.
 */
export async function runDeliberate({ incident, workspaceRoot, model, timeoutMs }) {
  if (!incident || !incident.trim()) {
    throw new Error('runDeliberate: incident must be a non-empty string.');
  }

  const cwd = workspaceRoot ?? process.cwd();
  const resolvedModel = model ?? DEFAULT_MODEL;
  const resolvedTimeout = timeoutMs ?? 10 * 60 * 1000; // deliberate is longer — 10 min default

  const registryPath = resolve(cwd, '.repo-orchestrator', 'registry.json');
  try {
    readFileSync(registryPath, 'utf8');
  } catch {
    throw new Error(`Registry not found at ${registryPath}. Run /repo-orch-init in the workspace first.`);
  }

  const runQuery = async () => {
    let report = '';
    for await (const message of query({
      prompt: `/repo-orch-deliberate ${incident}`,
      options: {
        model: resolvedModel,
        permissionMode: 'plan',
        allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Agent'],
        cwd,
        env: {
          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
        },
        plugins: [
          { type: 'local', path: PLUGIN_ROOT },
        ],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: [
            'You are a headless adversarial deliberation runner for the repo-orchestrator plugin.',
            'You will receive a single incident description. Run /repo-orch-deliberate on it and return the complete root-cause report.',
            'IMPORTANT: Do not ask clarifying questions under any circumstances — proceed with all registered repos even if the incident text is brief.',
            'Do not modify any files. Output the final report and nothing else.',
            `Workspace root: ${cwd}`,
          ].join('\n'),
        },
      },
    })) {
      if (message.type === 'result') {
        if ('result' in message) {
        report = message.result;
      } else {
        throw new Error(`Agent failed (${message.subtype}): ${message.errors?.join('; ') ?? 'unknown error'}`);
      }
        break;
      }
    }
    return report;
  };

  if (resolvedTimeout === 0) return runQuery();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(
        `runDeliberate timed out after ${resolvedTimeout}ms. ` +
        'Pass a longer timeoutMs, or set timeoutMs: 0 to disable the timeout.'
      )),
      resolvedTimeout
    )
  );

  return Promise.race([runQuery(), timeoutPromise]);
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
