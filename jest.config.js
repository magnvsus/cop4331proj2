module.exports = {
  testEnvironment: 'node',
  // Scope Jest to the backend only -- the frontend project uses Vitest for
  // its .test.ts(x) files, which Jest has no transform for.
  testMatch: ['<rootDir>/backend/**/*.test.js'],
  clearMocks: true,
};
