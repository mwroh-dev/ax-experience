/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['\\.e2e\\.spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@cs-ops-core/(.*)$': '<rootDir>/../cs-ops-core/src/$1',
    '^@api/(.*)$': '<rootDir>/../api/src/$1',
    '^@slack/bolt$': '<rootDir>/../api/node_modules/@slack/bolt',
    '^@slack/web-api$': '<rootDir>/../api/node_modules/@slack/web-api',
  },
};
