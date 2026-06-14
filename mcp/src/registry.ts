/**
 * Zod schema for the orchestrator registry — the runtime mirror of
 * `schemas/registry.schema.json` (the authoritative JSON Schema contract).
 *
 * This is the single zod source of truth for registry validation. A parity
 * test (`test/registry-schema.test.ts`) asserts this schema and the JSON
 * Schema accept/reject the same inputs, so the two cannot drift silently.
 *
 * Note on dates: the JSON Schema marks `generatedAt`/`lastIndexed` as
 * `format: date-time`, but ajv does not enforce formats without `ajv-formats`.
 * To keep zod↔JSON-Schema parity exact, we validate these as plain strings
 * here and assert only the structural constraints both engines enforce
 * (required, type, pattern, const, additionalProperties, uniqueItems).
 */

import { z } from 'zod';

const uniqueStrings = z
  .array(z.string())
  .refine((a) => new Set(a).size === a.length, { message: 'must be unique' });

const stringArray = z.array(z.string());

// Routing-poisoning bound: `find_owning_repos` ranks repos by how many of these
// keywords match a query, so an unbounded list lets a repo keyword-stuff its way
// to the top and hijack routing. Cap the routing arrays (kept in parity with the
// `maxItems` in registry.schema.json).
export const ROUTING_MAX = 100;
const routingArray = z.array(z.string()).max(ROUTING_MAX);

export const RepoEntrySchema = z
  .object({
    // ── required ──
    name: z.string().regex(/^[a-z0-9-]+$/),
    path: z.string().regex(/^\.\//),
    agentType: z.string().regex(/^repo-[a-z0-9-]+$/),
    agentFile: z.string().regex(/^\.claude\/agents\/repo-[a-z0-9-]+\.md$/),
    contextFile: z.string().regex(/^\.repo-orchestrator\/context\/[a-z0-9-]+\.md$/),
    languages: uniqueStrings,
    frameworks: uniqueStrings,
    owns: routingArray,
    endpoints: routingArray,
    emits: routingArray,
    consumes: routingArray,
    dependsOn: stringArray,
    providesTo: stringArray,
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    lastIndexed: z.string(),
    userEdited: z.boolean(),
    // ── optional ──
    owner: z
      .object({
        team: z.string().optional(),
        contact: z.string().optional(),
        oncall: z.string().optional(),
      })
      .strict()
      .optional(),
    apiVersion: z.string().optional(),
    deprecates: stringArray.optional(),
    authContracts: z
      .object({
        requires: stringArray.optional(),
        issues: stringArray.optional(),
        scopes: stringArray.optional(),
      })
      .strict()
      .optional(),
    errorContracts: z
      .object({
        codes: stringArray.optional(),
        idempotent: z.union([z.boolean(), z.string()]).optional(),
        retryOn: stringArray.optional(),
        retryStrategy: z.string().optional(),
      })
      .strict()
      .optional(),
    configContracts: z
      .object({
        envVars: stringArray.optional(),
        featureFlags: stringArray.optional(),
      })
      .strict()
      .optional(),
    dataContracts: z
      .object({
        sharedTables: stringArray.optional(),
        sharedCacheKeys: stringArray.optional(),
      })
      .strict()
      .optional(),
    serviceLevel: z
      .object({
        latencyTarget: z.string().optional(),
        throughput: z.string().optional(),
        availability: z.string().optional(),
        degradedMode: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const RegistrySchema = z
  .object({
    version: z.literal(1),
    generatedAt: z.string(),
    repos: z.array(RepoEntrySchema).min(1),
  })
  .strict();

export type RepoEntry = z.infer<typeof RepoEntrySchema>;
export type Registry = z.infer<typeof RegistrySchema>;

/** Format zod issues into a single readable line for tool-error responses. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}
