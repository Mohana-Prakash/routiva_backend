/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/env.setup.ts'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  testTimeout: 30000,
  maxWorkers: 1,
  clearMocks: true,
};
