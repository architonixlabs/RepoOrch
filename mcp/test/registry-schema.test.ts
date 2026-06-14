/**
 * Drift guard: the zod RegistrySchema (src/registry.ts) and the authoritative
 * JSON Schema (schemas/registry.schema.json) MUST accept/reject the same inputs.
 *
 * If someone edits one schema and forgets the other, a fixture's verdict
 * diverges and this test fails — turning silent drift into a red CI run.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { RegistrySchema } from '../src/registry.js';

const schemaPath = fileURLToPath(
  new URL('../../schemas/registry.schema.json', import.meta.url),
);
const jsonSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));

// validateFormats:false — we deliberately do NOT assert `format` (e.g. date-time);
// the zod schema mirrors this by typing date fields as plain strings, so the two
// stay in parity on the structural constraints both engines enforce.
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const ajvValidate = ajv.compile(jsonSchema);

const validEntry = () => ({
  name: 'auth-service',
  path: './auth-service',
  agentType: 'repo-auth-service',
  agentFile: '.claude/agents/repo-auth-service.md',
  contextFile: '.repo-orchestrator/context/auth-service.md',
  languages: ['TypeScript'],
  frameworks: ['NestJS'],
  owns: ['auth'],
  endpoints: ['POST /login'],
  emits: ['user.created'],
  consumes: [],
  dependsOn: [],
  providesTo: [],
  fingerprint: 'sha256:' + 'a'.repeat(64),
  lastIndexed: '2026-01-01T00:00:00Z',
  userEdited: false,
});

const validRegistry = (entry: Record<string, unknown> = validEntry()) => ({
  version: 1,
  generatedAt: '2026-01-01T00:00:00Z',
  repos: [entry],
});

// Each fixture is run through BOTH validators; we assert (a) they agree and
// (b) they agree on the *expected* verdict.
const fixtures: Array<{ label: string; data: unknown; valid: boolean }> = [
  { label: 'minimal valid entry', data: validRegistry(), valid: true },
  {
    label: 'full valid entry (all optional contracts)',
    data: validRegistry({
      ...validEntry(),
      owner: { team: 'Platform', contact: '#platform' },
      apiVersion: 'v2',
      deprecates: ['v1'],
      authContracts: { requires: ['sub (userId UUID)'], scopes: ['read:orders'] },
      errorContracts: { codes: ['400 validation'], idempotent: 'partial', retryOn: ['503'] },
      configContracts: { envVars: ['JWT_SECRET'], featureFlags: ['ENABLE_X'] },
      dataContracts: { sharedTables: ['users.id'], sharedCacheKeys: ['session:<id>'] },
      serviceLevel: { latencyTarget: 'p95 < 200ms', availability: '99.9%' },
    }),
    valid: true,
  },
  {
    label: 'missing required field (fingerprint)',
    data: (() => { const e = validEntry(); delete (e as Record<string, unknown>).fingerprint; return validRegistry(e); })(),
    valid: false,
  },
  {
    label: 'bad name pattern (uppercase/underscore)',
    data: validRegistry({ ...validEntry(), name: 'Auth_Service' }),
    valid: false,
  },
  {
    label: 'bad fingerprint pattern',
    data: validRegistry({ ...validEntry(), fingerprint: 'sha256:xyz' }),
    valid: false,
  },
  {
    label: 'unknown additional property on repo',
    data: validRegistry({ ...validEntry(), bogus: 1 }),
    valid: false,
  },
  {
    label: 'wrong schema version (const 1)',
    data: { ...validRegistry(), version: 2 },
    valid: false,
  },
  {
    label: 'empty repos array (minItems 1)',
    data: { version: 1, generatedAt: '2026-01-01T00:00:00Z', repos: [] },
    valid: false,
  },
  {
    label: 'duplicate languages (uniqueItems)',
    data: validRegistry({ ...validEntry(), languages: ['ts', 'ts'] }),
    valid: false,
  },
  {
    label: 'wrong type (userEdited as string)',
    data: validRegistry({ ...validEntry(), userEdited: 'yes' }),
    valid: false,
  },
  {
    label: 'routing array at the cap (100) is allowed',
    data: validRegistry({ ...validEntry(), owns: Array.from({ length: 100 }, (_, i) => `kw${i}`) }),
    valid: true,
  },
  {
    label: 'routing array over the cap (101) is rejected (routing-poisoning bound)',
    data: validRegistry({ ...validEntry(), owns: Array.from({ length: 101 }, (_, i) => `kw${i}`) }),
    valid: false,
  },
];

describe('registry schema parity (zod ↔ JSON Schema)', () => {
  for (const { label, data, valid } of fixtures) {
    test(`${label}: zod and JSON Schema agree (${valid ? 'valid' : 'invalid'})`, () => {
      const ajvValid = ajvValidate(data) as boolean;
      const zodValid = RegistrySchema.safeParse(data).success;
      // The two engines must reach the same verdict — this is the drift guard.
      expect(zodValid).toBe(ajvValid);
      // ...and that verdict must be the expected one.
      expect(zodValid).toBe(valid);
    });
  }
});
