// See: https://jestjs.io/docs/configuration
import { createJsWithTsEsmPreset } from 'ts-jest'

const tsjestPreset = createJsWithTsEsmPreset({
  tsconfig: 'tsconfig.test.json'
})

/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: ['./src/**'],
  coverageDirectory: './coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  coverageReporters: ['json-summary', 'text', 'lcov'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js'],
  reporters: ['default'],
  resolver: 'ts-jest-resolver',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/dist/', '/node_modules/'],
  ...tsjestPreset,
  verbose: true
}
