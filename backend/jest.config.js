/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  // NestJS 12 ships as pure ESM, so the test runner has to work in ESM too.
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    // ts-jest compiles with tsc, so decorator metadata survives for Nest DI.
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          target: 'ES2021',
          moduleResolution: 'bundler',
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  // These suites drive one real PostgreSQL database, so running them in
  // parallel lets one suite's cleanup wipe another's state mid-assertion.
  maxWorkers: 1,
};
