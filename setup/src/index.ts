#!/usr/bin/env node
/**
 * repo-orchestrator setup runner.
 *
 * Invoked two ways:
 *  - by `/repo-orch-setup` via Claude's Bash tool — NON-interactive (no TTY):
 *    scans, auto-installs optional components, prints guidance.
 *  - directly in a human's terminal (TTY): a polished @clack/prompts wizard with
 *    a component multiselect and spinners.
 *
 * Shipped as a single dependency-free bundle (esbuild) at dist/index.js, so it
 * runs on a fresh install with only `node` — no `npm install` required.
 */

import chalk from 'chalk';
import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as p from '@clack/prompts';
import { semverGte, pluginPath, withMcpServer, hasMcpServer, checkWorkspaceHealth } from './lib.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type Status = 'OK' | 'OPTIONAL' | 'OLD' | 'MISSING' | 'SKIP';
interface CheckResult { status: Status; detail: string; }
interface ScanResults {
  claudeCode: CheckResult;
  agentTeams: CheckResult;
  nodejs: CheckResult & { version: string };
  npm: CheckResult;
  tier1: CheckResult;
  tier2: CheckResult;
  mcpWired: CheckResult;
  workspace: CheckResult & { count: number; names: string[] };
}

const VERSION = '0.3.0';
const TTY = Boolean(process.stdout.isTTY);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FIX_HINTS: Record<string, string> = {
  'Agent Teams': 'Create .claude/settings.json with { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }',
  'Tier-1 indexer': 'Run: cd .claude/plugins/repo-orchestrator/indexer && npm install && npm run build',
  'Tier-2 MCP server': 'Run: cd .claude/plugins/repo-orchestrator/mcp && npm install && npm run build',
};

const icon = (s: Status): string => {
  switch (s) {
    case 'OK': return chalk.green('✓');
    case 'OPTIONAL': return chalk.yellow('○');
    case 'SKIP': return chalk.dim('─');
    default: return chalk.red('✗');
  }
};

async function getVersion(cmd: string, args: string[] = ['--version']): Promise<string> {
  try {
    const r = await execa(cmd, args, { reject: false });
    const out = (r.stdout + r.stderr).trim();
    const m = out.match(/(\d+\.\d+\.\d+)/);
    return m ? m[1] : out.split('\n')[0].trim();
  } catch {
    return '';
  }
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

async function runScan(cwd: string): Promise<ScanResults> {
  const ccVer = await getVersion('claude');
  const claudeCode: CheckResult = ccVer
    ? semverGte(ccVer, '2.1.32')
      ? { status: 'OK', detail: `v${ccVer}` }
      : { status: 'OLD', detail: `v${ccVer} — needs 2.1.32+ for Agent Teams` }
    : { status: 'MISSING', detail: 'not found on PATH' };

  const atEnv = process.env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1';
  const settingsPath = join(cwd, '.claude', 'settings.json');
  let atSettings = false;
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      atSettings = (settings['env'] as Record<string, string> | undefined)?.['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1';
    } catch { /* ignore */ }
  }
  const agentTeams: CheckResult = atEnv || atSettings
    ? { status: 'OK', detail: 'enabled' }
    : { status: 'OPTIONAL', detail: 'not set — multi-repo deliberation inactive' };

  const nodeVer = await getVersion('node');
  const nodeMajor = nodeVer ? parseInt(nodeVer.split('.')[0], 10) : 0;
  const nodejs: CheckResult & { version: string } = !nodeVer
    ? { status: 'OPTIONAL', detail: 'not installed (Tier-0 still works)', version: '' }
    : nodeMajor >= 18
      ? { status: 'OK', detail: `v${nodeVer}`, version: nodeVer }
      : { status: 'OLD', detail: `v${nodeVer} — needs 18+ for Tier-1/2`, version: nodeVer };

  const npmVer = nodeVer ? await getVersion('npm') : '';
  const npm: CheckResult = !nodeVer
    ? { status: 'SKIP', detail: 'skipped (Node.js absent)' }
    : npmVer
      ? { status: 'OK', detail: `v${npmVer}` }
      : { status: 'MISSING', detail: 'not found (required alongside Node.js)' };

  const pp = pluginPath(cwd);
  const t1Built = existsSync(join(pp, 'indexer', 'dist', 'index.js'));
  const tier1: CheckResult = t1Built
    ? { status: 'OK', detail: 'built — fast deterministic indexing active' }
    : nodeVer ? { status: 'OPTIONAL', detail: 'not built (Tier-0 fallback active)' }
      : { status: 'SKIP', detail: 'skipped (Node.js absent)' };

  const t2Built = existsSync(join(pp, 'mcp', 'dist', 'server.js'));
  const tier2: CheckResult = t2Built
    ? { status: 'OK', detail: 'built — live registry tools available' }
    : nodeVer ? { status: 'OPTIONAL', detail: 'not built (triage works without it)' }
      : { status: 'SKIP', detail: 'skipped (Node.js absent)' };

  const mcpWired: CheckResult = hasMcpServer(settings)
    ? { status: 'OK', detail: 'wired into .claude/settings.json' }
    : t2Built ? { status: 'OPTIONAL', detail: 'built but not wired' }
      : { status: 'SKIP', detail: 'skipped (MCP server not built)' };

  let gitDirs: string[] = [];
  try {
    gitDirs = readdirSync(cwd).filter(d => {
      try { return statSync(join(cwd, d)).isDirectory() && existsSync(join(cwd, d, '.git')); }
      catch { return false; }
    });
  } catch { /* ignore */ }
  const workspace: CheckResult & { count: number; names: string[] } = gitDirs.length
    ? { status: 'OK', detail: `${gitDirs.length} repo(s): ${gitDirs.join(', ')}`, count: gitDirs.length, names: gitDirs }
    : { status: 'MISSING', detail: 'no git repos found as immediate subdirectories', count: 0, names: [] };

  return { claudeCode, agentTeams, nodejs, npm, tier1, tier2, mcpWired, workspace };
}

function renderDashboard(r: ScanResults): string {
  const row = (label: string, res: CheckResult) => `${icon(res.status)}  ${label.padEnd(20)} ${res.detail}`;
  return [
    row('Claude Code', r.claudeCode),
    // LLM backend is fixed by design — the plugin uses the current Claude Code
    // session and connects to NO external or local model (no API key needed).
    `${icon('OK')}  ${'LLM backend'.padEnd(20)} Claude Code session — no API key or local model needed`,
    row('Agent Teams', r.agentTeams),
    row('Node.js', r.nodejs),
    row('npm', r.npm),
    row('Tier-1 indexer', r.tier1),
    row('Tier-2 MCP server', r.tier2),
    row('MCP wiring', r.mcpWired),
    row('Workspace layout', r.workspace),
    '',
    chalk.dim('✓ ready   ○ optional   ─ skipped   ✗ action needed'),
  ].join('\n');
}

// ─── Install tasks ────────────────────────────────────────────────────────────

interface InstallTask { title: string; task: () => Promise<void>; skip: () => boolean; }

function buildInstallTasks(r: ScanResults, cwd: string): InstallTask[] {
  const tasks: InstallTask[] = [];

  tasks.push({
    title: 'Enable Agent Teams (.claude/settings.json)',
    skip: () => r.agentTeams.status === 'OK',
    task: async () => {
      const dir = join(cwd, '.claude');
      const p2 = join(dir, 'settings.json');
      mkdirSync(dir, { recursive: true });
      let cfg: Record<string, unknown> = {};
      if (existsSync(p2)) { try { cfg = JSON.parse(readFileSync(p2, 'utf8')); } catch { /* fresh */ } }
      const env = (cfg['env'] as Record<string, string> | undefined) ?? {};
      env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] = '1';
      cfg['env'] = env;
      const exp = (cfg['experimental'] as Record<string, unknown> | undefined) ?? {};
      exp['teammateMode'] = true;
      cfg['experimental'] = exp;
      writeFileSync(p2, JSON.stringify(cfg, null, 2) + '\n');
    },
  });

  tasks.push({
    title: 'Build Tier-1 indexer (npm install + build)',
    skip: () => r.tier1.status !== 'OPTIONAL',
    task: async () => {
      const dir = join(pluginPath(cwd), 'indexer');
      if (!existsSync(dir)) throw new Error('Indexer directory not found at ' + dir);
      await execa('npm', ['install', '--silent'], { cwd: dir });
      await execa('npm', ['run', 'build', '--silent'], { cwd: dir });
    },
  });

  tasks.push({
    title: 'Build Tier-2 MCP server (npm install + build)',
    skip: () => r.tier2.status !== 'OPTIONAL',
    task: async () => {
      const dir = join(pluginPath(cwd), 'mcp');
      if (!existsSync(dir)) throw new Error('MCP directory not found at ' + dir);
      await execa('npm', ['install', '--silent'], { cwd: dir });
      await execa('npm', ['run', 'build', '--silent'], { cwd: dir });
    },
  });

  tasks.push({
    title: 'Wire MCP server into .claude/settings.json',
    skip: () => {
      if (!r.nodejs.version) return true;
      const p2 = join(cwd, '.claude', 'settings.json');
      if (!existsSync(p2)) return false;
      try { return hasMcpServer(JSON.parse(readFileSync(p2, 'utf8'))); } catch { return false; }
    },
    task: async () => {
      const dir = join(cwd, '.claude');
      const p2 = join(dir, 'settings.json');
      mkdirSync(dir, { recursive: true });
      let cfg: Record<string, unknown> = {};
      if (existsSync(p2)) { try { cfg = JSON.parse(readFileSync(p2, 'utf8')); } catch { /* fresh */ } }
      writeFileSync(p2, JSON.stringify(withMcpServer(cfg), null, 2) + '\n');
    },
  });

  return tasks;
}

async function runTask(t: InstallTask): Promise<void> {
  if (TTY) {
    const s = p.spinner();
    s.start(t.title);
    try { await t.task(); s.stop(chalk.green(`✓ ${t.title}`)); }
    catch (e) { s.stop(chalk.red(`✗ ${t.title}`)); throw e; }
  } else {
    p.log.step(t.title);
    await t.task();
    p.log.success(`done: ${t.title}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cwd = process.cwd();

  // Deterministic, no-LLM health check — `node dist/index.js --verify`.
  if (process.argv.includes('--verify')) {
    p.intro(chalk.cyan('repo-orchestrator · Health check'));
    const report = checkWorkspaceHealth(cwd);
    p.note(
      report.checks.map(c => `${c.ok ? chalk.green('✓') : chalk.red('✗')}  ${c.label.padEnd(24)} ${c.detail}`).join('\n'),
      'Workspace readiness',
    );
    if (report.ok) {
      p.outro(chalk.green('All checks passed — workspace is ready.'));
    } else {
      p.outro(chalk.yellow('Some checks failed — see above. Run /repo-orch-init or /repo-orch-sync.'));
      process.exitCode = 1;
    }
    return;
  }

  p.intro(chalk.cyan(`repo-orchestrator v${VERSION} · Setup`));

  let results: ScanResults;
  if (TTY) {
    const s = p.spinner();
    s.start('Scanning environment');
    results = await runScan(cwd);
    s.stop('Environment scanned');
  } else {
    p.log.step('Scanning environment…');
    results = await runScan(cwd);
  }

  p.note(renderDashboard(results), 'Environment');

  // Only hard blocker.
  if (results.workspace.status === 'MISSING') {
    p.cancel('No git repositories found as immediate subdirectories. cd into your workspace root (its subdirectories should be your service repos) and re-run.');
    process.exit(1);
  }

  // Transparency — say exactly what will change.
  p.note(
    [
      'create / update  .claude/settings.json   (Agent Teams; MCP wiring if built)',
      'build optional tiers (indexer, MCP)        (only if Node 18+; failures are non-fatal)',
      'then  /repo-orch-init                      (discover repos → registry + context)',
      '',
      chalk.dim('Never modifies your service repos\' code; never commits, pushes, or deletes.'),
    ].join('\n'),
    'Setup will',
  );

  const pending = buildInstallTasks(results, cwd).filter(t => !t.skip());
  let chosen = pending;

  if (pending.length === 0) {
    p.log.info('All optional components already installed — nothing to do.');
  } else if (TTY) {
    const sel = await p.multiselect({
      message: 'Optional components to install (space to toggle, enter to confirm):',
      options: pending.map((t, i) => ({ value: i, label: t.title })),
      initialValues: pending.map((_, i) => i),
      required: false,
    });
    if (p.isCancel(sel)) { p.cancel('Setup cancelled — no changes made.'); process.exit(0); }
    chosen = (sel as number[]).map(i => pending[i]);
  }

  const errors: Array<{ title: string; message: string }> = [];
  for (const t of chosen) {
    try { await runTask(t); }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ title: t.title, message });
      // Non-fatal: report and continue.
      p.log.error(`${t.title} failed: ${message}`);
      const hint = Object.keys(FIX_HINTS).find(k => t.title.includes(k));
      if (hint) p.log.info(`Fix: ${FIX_HINTS[hint]}`);
    }
  }

  // Re-scan agent-teams state cheaply from settings to decide the restart gate.
  const settingsPath = join(cwd, '.claude', 'settings.json');
  let teamsActiveNow = process.env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1';
  if (!teamsActiveNow && existsSync(settingsPath)) {
    try {
      const cfg = JSON.parse(readFileSync(settingsPath, 'utf8'));
      teamsActiveNow = (cfg?.env?.['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1');
    } catch { /* ignore */ }
  }

  p.note(
    [
      `Workspace   ${chalk.white(cwd)}`,
      `Repos       ${chalk.white(results.workspace.count + ': ' + results.workspace.names.join(', '))}`,
      `Components  ${errors.length === 0 ? chalk.green('all requested installed') : chalk.yellow(errors.length + ' failed (non-fatal)')}`,
    ].join('\n'),
    'Summary',
  );

  // Restart gate — only when Agent Teams wasn't already active at session start.
  if (results.agentTeams.status !== 'OK') {
    p.outro(chalk.yellow('Agent Teams was just enabled — restart Claude Code, then run  /repo-orch-init  to bootstrap.'));
  } else {
    p.outro('Setup complete. Next:  /repo-orch-init');
  }
}

main().catch((err: unknown) => {
  p.log.error(String(err));
  process.exit(1);
});
