/**
 * ESM jest config for the automation package (plain .mjs, no transform).
 * Run via `npm test` (which sets --experimental-vm-modules).
 */
export default {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.mjs'],
  transform: {},
};
