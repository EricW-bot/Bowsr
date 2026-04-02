module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverageFrom: ['**/*.{ts,tsx}', '!**/node_modules/**', '!**/*.d.ts'],
  testPathIgnorePatterns: ['/node_modules/']
};
