/**
 * ESM jest config for the MCP server package.
 * Run via `npm test` (which sets --experimental-vm-modules).
 */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  // Strip the runtime-mandatory `.js` extension off relative imports so
  // ts-jest resolves the `.ts` source (see project-context: .js imports rule).
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true }] },
  testMatch: ['**/test/**/*.test.ts'],
};
