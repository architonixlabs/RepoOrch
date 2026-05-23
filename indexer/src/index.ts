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
