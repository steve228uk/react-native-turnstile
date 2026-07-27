module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/tests/**/*.test.[jt]s?(x)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  clearMocks: true,
  transformIgnorePatterns: [
    'node_modules/(?!((?:\\.bun/[^/]+/node_modules/)?(?:jest-)?react-native|(?:\\.bun/[^/]+/node_modules/)?@react-native(?:-community)?)/)',
  ],
};
