import baseConfig from '../../jest.config.mjs'

export default {
  ...baseConfig,
  rootDir: '.',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/dist/', '/lib/', '/node_modules/'],
}
