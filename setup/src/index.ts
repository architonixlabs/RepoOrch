#!/usr/bin/env node
import chalk from 'chalk';
import { execa } from 'execa';
import { Listr, ListrTaskWrapper, ListrRenderer } from 'listr2';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'OK' | 'OPTIONAL' | 'OLD' | 'MISSING' | 'SKIP';

interface CheckResult {
  status: Status;
  detail: string;
}

interface ScanResults {
  claudeCode: CheckResult;
  agentTeams: CheckResult;
  nodejs: CheckResult & { version: string };
  npm: CheckResult;
  tier1: CheckResult;
  tier2: CheckResult;
  workspace: CheckResult & { count: number; names: string[] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FIX_HINTS: Record<string, string> = {
  'Agent Teams': 'Create .claude/settings.json with { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }',
  'Tier-1 indexer':  'Run: cd .claude/plugins/repo-orchestrator/indexer && npm install && npm run build',
  'Tier-2 MCP server': 'Run: cd .claude/plugins/repo-orchestrator/mcp && npm install && npm run build',
};

const icon = (s: Status) => {
  switch (s) {
    case 'OK':       return chalk.green('✓');
    case 'OPTIONAL': return chalk.yellow('○');
    case 'SKIP':     return chalk.dim('─');
    default:         return chalk.red('✗');
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

function semverGte(ver: string, min: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [ma, mi, pa] = parse(ver);
  const [mb, mib, pb] = parse(min);
  if (ma !== mb) return ma > mb;
  if (mi !== mib) return mi > mib;
  return pa >= pb;
}

function pluginPath(workspace: string): string {
  return join(workspace, '.claude', 'plugins', 'repo-orchestrator');
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

async function runScan(cwd: string): Promise<ScanResults> {
  // Claude Code
  const ccVer = await getVersion('claude');
  const claudeCode: CheckResult = ccVer
    ? semverGte(ccVer, '2.1.32')
      ? { status: 'OK', detail: `v${ccVer}` }
      : { status: 'OLD', detail: `v${ccVer} — needs 2.1.32+ for Agent Teams` }
    : { status: 'MISSING', detail: 'not found on PATH' };

  // Agent Teams
  const atEnv = process.env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1';
  const settingsPath = join(cwd, '.claude', 'settings.json');
  let atSettings = false;
  if (existsSync(settingsPath)) {
    try {
      const cfg = JSON.parse(readFileSync(settingsPath, 'utf8'));
      atSettings = cfg?.env?.['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1';
    } catch { /* ignore */ }
  }
  const agentTeams: CheckResult = atEnv || atSettings
    ? { status: 'OK', detail: 'enabled' }
    : { status: 'OPTIONAL', detail: 'not set — multi-repo deliberation inactive' };

  // Node.js
  const nodeVer = await getVersion('node');
  const nodeMajor = nodeVer ? parseInt(nodeVer.split('.')[0], 10) : 0;
  const nodejs: CheckResult & { version: string } = !nodeVer
    ? { status: 'OPTIONAL', detail: 'not installed (Tier-0 still works)', version: '' }
    : nodeMajor >= 18
      ? { status: 'OK', detail: `v${nodeVer}`, version: nodeVer }
      : { status: 'OLD', detail: `v${nodeVer} — needs 18+ for Tier-1/2`, version: nodeVer };

  // npm
  const npmVer = nodeVer ? await getVersion('npm') : '';
  const npm: CheckResult = !nodeVer
    ? { status: 'SKIP', detail: 'skipped (Node.js absent)' }
    : npmVer
      ? { status: 'OK', detail: `v${npmVer}` }
      : { status: 'MISSING', detail: 'not found (required alongside Node.js)' };

  // Tier-1 indexer
  const pp = pluginPath(cwd);
  const t1Built = existsSync(join(pp, 'indexer', 'dist', 'index.js'));
  const tier1: CheckResult = t1Built
    ? { status: 'OK', detail: 'built — fast deterministic indexing active' }
    : nodeVer
      ? { status: 'OPTIONAL', detail: 'not built (Tier-0 fallback active)' }
      : { status: 'SKIP', detail: 'skipped (Node.js absent)' };

  // Tier-2 MCP server
  const t2Built = existsSync(join(pp, 'mcp', 'dist', 'server.js'));
  const tier2: CheckResult = t2Built
    ? { status: 'OK', detail: 'built — live registry tools available' }
    : nodeVer
      ? { status: 'OPTIONAL', detail: 'not built (triage works without it)' }
      : { status: 'SKIP', detail: 'skipped (Node.js absent)' };

  // Workspace layout
  let gitDirs: string[] = [];
  try {
    const { readdirSync, statSync } = await import('fs');
    gitDirs = readdirSync(cwd)
      .filter(d => {
        try { return statSync(join(cwd, d)).isDirectory() && existsSync(join(cwd, d, '.git')); }
        catch { return false; }
      });
  } catch { /* ignore */ }
  const workspace: CheckResult & { count: number; names: string[] } = gitDirs.length
    ? { status: 'OK', detail: `${gitDirs.length} repo(s): ${gitDirs.join(', ')}`, count: gitDirs.length, names: gitDirs }
    : { status: 'MISSING', detail: 'no git repos found as immediate subdirectories', count: 0, names: [] };

  return { claudeCode, agentTeams, nodejs, npm, tier1, tier2, workspace };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function printDashboard(r: ScanResults): void {
  const row = (label: string, res: CheckResult) =>
    `  ${icon(res.status)}  ${label.padEnd(22)} ${res.detail}`;

  const sep = chalk.dim('  ' + '─'.repeat(62));

  console.log(chalk.bold('\n  Environment Check'));
  console.log(sep);
  console.log(chalk.dim('  Component              Detail'));
  console.log(sep);
  console.log(row('Claude Code', r.claudeCode));
  console.log(row('Agent Teams', r.agentTeams));
  console.log(sep);
  console.log(row('Node.js', r.nodejs));
  console.log(row('npm', r.npm));
  console.log(sep);
  console.log(row('Tier-1 indexer', r.tier1));
  console.log(row('Tier-2 MCP server', r.tier2));
  console.log(sep);
  console.log(row('Workspace layout', r.workspace));
  console.log(sep);
  console.log(chalk.dim('\n  Legend:  ') +
    chalk.green('✓ ready') + chalk.dim('   ') +
    chalk.yellow('○ optional') + chalk.dim('   ') +
    chalk.dim('─ skipped') + chalk.dim('   ') +
    chalk.red('✗ action needed'));
}

// ─── Install tasks ────────────────────────────────────────────────────────────

function buildInstallTasks(r: ScanResults, cwd: string) {
  const tasks: Array<{ title: string; task: () => Promise<void>; skip: () => boolean }> = [];

  // Agent Teams
  tasks.push({
    title: 'Agent Teams  →  write .claude/settings.json',
    skip: () => r.agentTeams.status === 'OK',
    task: async () => {
      const dir = join(cwd, '.claude');
      const p = join(dir, 'settings.json');
      mkdirSync(dir, { recursive: true });
      let cfg: Record<string, unknown> = {};
      if (existsSync(p)) {
        try { cfg = JSON.parse(readFileSync(p, 'utf8')); } catch { /* start fresh */ }
      }
      const env = (cfg['env'] as Record<string, string> | undefined) ?? {};
      env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] = '1';
      cfg['env'] = env;
      const exp = (cfg['experimental'] as Record<string, unknown> | undefined) ?? {};
      exp['teammateMode'] = true;
      cfg['experimental'] = exp;
      writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
    },
  });

  // Tier-1 indexer
  tasks.push({
    title: 'Tier-1 indexer  →  npm install + build',
    skip: () => r.tier1.status !== 'OPTIONAL',
    task: async () => {
      const dir = join(pluginPath(cwd), 'indexer');
      if (!existsSync(dir)) throw new Error('Indexer directory not found at ' + dir);
      await execa('npm', ['install', '--silent'], { cwd: dir });
      await execa('npm', ['run', 'build', '--silent'], { cwd: dir });
    },
  });

  // Tier-2 MCP server
  tasks.push({
    title: 'Tier-2 MCP server  →  npm install + build',
    skip: () => r.tier2.status !== 'OPTIONAL',
    task: async () => {
      const dir = join(pluginPath(cwd), 'mcp');
      if (!existsSync(dir)) throw new Error('MCP directory not found at ' + dir);
      await execa('npm', ['install', '--silent'], { cwd: dir });
      await execa('npm', ['run', 'build', '--silent'], { cwd: dir });
    },
  });

  return tasks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const VERSION = '0.3.0';
const cwd = process.cwd();

// Banner
console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan('║') + chalk.bold(`   repo-orchestrator  v${VERSION}  ·  Setup & Installation         `) + chalk.cyan('║'));
console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝'));
console.log(chalk.dim('\n  Steps:') +
  chalk.cyan('  [1] Scan environment') +
  chalk.dim('  [2] Install components') +
  chalk.dim('  [3] Bootstrap'));

// ── Step 1: Scan ──
console.log(chalk.bold(chalk.cyan('\n  [1/3]')) + chalk.bold('  Scanning environment…'));
console.log(chalk.dim('  ' + '─'.repeat(62)));

const scanTasks = new Listr(
  [
    'Claude Code',
    'Agent Teams',
    'Node.js / npm',
    'Tier-1 indexer',
    'Tier-2 MCP server',
    'Workspace layout',
  ].map(label => ({
    title: chalk.dim(`       Checking ${label}…`),
    task: async (_ctx: unknown, task: ListrTaskWrapper<unknown, typeof ListrRenderer, typeof ListrRenderer>) => {
      await new Promise(r => setTimeout(r, 0));
      task.title = chalk.dim(`       ${label}`);
    },
  })),
  { concurrent: false, renderer: 'simple' }
);

await scanTasks.run().catch(() => { /* harmless — just display tasks */ });

const results = await runScan(cwd);

// Dashboard
printDashboard(results);

// Blocker check
if (results.workspace.status === 'MISSING') {
  console.log(chalk.red('\n  ✗  No git repositories found in this directory.'));
  console.log(chalk.dim('\n     repo-orchestrator expects each microservice to be an immediate'));
  console.log(chalk.dim('     subdirectory with its own .git folder:\n'));
  console.log(chalk.dim('       my-project/         ← run repo-orch-setup here'));
  console.log(chalk.dim('       ├── auth-service/   ← git repo'));
  console.log(chalk.dim('       ├── payments/       ← git repo'));
  console.log(chalk.dim('       └── notifications/  ← git repo'));
  console.log(chalk.dim('\n     Please cd into your workspace root and run again.\n'));
  process.exit(1);
}

console.log(chalk.green('\n  Scan complete.'));

// ── Step 2: Install ──
const installTasks = buildInstallTasks(results, cwd);
const pending = installTasks.filter(t => !t.skip());

if (pending.length > 0) {
  console.log(chalk.bold(chalk.cyan('\n  [2/3]')) + chalk.bold('  Installing optional components…'));
  console.log(chalk.dim('  ' + '─'.repeat(62)));

  const listrInstall = new Listr(
    installTasks.map((t, i) => ({
      title: `  (2${String.fromCharCode(97 + i)}/3)  ${t.title}`,
      skip: t.skip,
      task: t.task,
    })),
    {
      concurrent: false,
      renderer: 'default',
      rendererOptions: {
        collapseSubtasks: false,
        collapseErrors: false,
      },
    }
  );

  const installErrors: Array<{ title: string; message: string }> = [];
  await listrInstall.run().catch((err: unknown) => {
    if (err && typeof err === 'object' && 'errors' in err) {
      const errs = (err as { errors: Array<{ message: string }> }).errors;
      errs.forEach((e, i) => {
        const taskTitle = installTasks[i]?.title ?? 'unknown task';
        installErrors.push({ title: taskTitle, message: e.message });
      });
    }
  });

  if (installErrors.length > 0) {
    console.log(chalk.yellow('\n  Some components could not be installed automatically:'));
    const sep = chalk.dim('  ' + '─'.repeat(62));
    console.log(sep);
    for (const { title, message } of installErrors) {
      const component = Object.keys(FIX_HINTS).find(k => title.includes(k)) ?? title;
      console.log(chalk.red(`\n  ✗  ${component}`));
      console.log(chalk.dim(`     Error: ${message}`));
      const hint = FIX_HINTS[component];
      if (hint) console.log(chalk.cyan(`     Fix:   ${hint}`));
    }
    console.log(sep);
    console.log(chalk.dim('\n  Fix the issues above, then re-run /repo-orch-setup.\n'));
  } else {
    console.log(chalk.green('\n  Component setup complete.'));
  }
} else {
  console.log(chalk.bold(chalk.cyan('\n  [2/3]')) + '  All optional components already installed — skipping.');
}

// ── Summary ──
const pp = pluginPath(cwd);
const t1Active = existsSync(join(pp, 'indexer', 'dist', 'index.js'));
const t2Active = existsSync(join(pp, 'mcp', 'dist', 'server.js'));
const atEnabled = results.agentTeams.status === 'OK'
  || (existsSync(join(cwd, '.claude', 'settings.json')) &&
    (() => { try { return JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf8'))?.env?.['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] === '1'; } catch { return false; } })());

const sep2 = chalk.dim('  ' + '─'.repeat(62));
console.log(chalk.bold('\n  Summary'));
console.log(sep2);
console.log(`  ${'Workspace'.padEnd(14)} ${chalk.white(cwd)}`);
console.log(`  ${'Repos found'.padEnd(14)} ${chalk.white(results.workspace.count + ': ' + results.workspace.names.join(', '))}`);
console.log(`  ${'Agent Teams'.padEnd(14)} ${atEnabled ? chalk.green('enabled') : chalk.yellow('not enabled — restart Claude Code after setup')}`);
console.log(`  ${'Knowledge'.padEnd(14)} ${chalk.dim('run /repo-orch-graph to build summaries (no API key needed)')}`);
console.log(`  ${'Indexer'.padEnd(14)} ${t1Active ? chalk.green('Tier-1 active') : chalk.dim('Tier-0 fallback')}`);
console.log(`  ${'MCP server'.padEnd(14)} ${t2Active ? chalk.green('Tier-2 active') : chalk.dim('not built')}`);
console.log(sep2);

// ── Step 3: Bootstrap ──
console.log(chalk.bold(chalk.cyan('\n  [3/3]')) + chalk.bold('  Bootstrapping workspace…'));
console.log(chalk.dim('  ' + '─'.repeat(62)));
console.log(chalk.dim('  Handing off to /repo-orch-init…\n'));
