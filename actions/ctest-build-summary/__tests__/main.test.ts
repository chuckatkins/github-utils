// __tests__/run.test.ts
import { join } from 'path'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

import { run } from '../src/main'

// Base fixture path relative to the test root
const fixtureBase = join(__dirname, '..', '__fixtures__')

function setupGitHub(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'action-test-'))

  process.env['GITHUB_ENV'] = join(tempDir, 'github_env')
  process.env['GITHUB_PATH'] = join(tempDir, 'github_path')
  process.env['GITHUB_OUTPUT'] = join(tempDir, 'github_output')
  process.env['GITHUB_STATE'] = join(tempDir, 'github_state')
  process.env['GITHUB_STEP_SUMMARY'] = join(tempDir, 'gihub_step_summary')
  process.env['GITHUB_REPOSITORY'] = 'testowner/test-repo'
  process.env['GITHUB_SHA'] = '0123456789abcdef0123456789abcdef01234567'

  // Create empty GITHUB_STEP_SUMMARY file
  writeFileSync(process.env['GITHUB_STEP_SUMMARY'], '')

  return tempDir
}

function destroyGitHub(tempDir: string) {
  delete process.env['GITHUB_ENV']
  delete process.env['GITHUB_PATH']
  delete process.env['GITHUB_OUTPUT']
  delete process.env['GITHUB_STATE']
  delete process.env['GITHUB_STEP_SUMMARY']
  delete process.env['GITHUB_REPOSITORY']
  delete process.env['GITHUB_SHA']

  if (tempDir) {
    if (process.env['TEST_DEBUG']) {
      console.log(`TEST_DEBUG is set, not deleting ${tempDir}`)
      return
    }
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function setupInput(format: string, dataset: string) {
  process.env['INPUT_SOURCE_DIR'] = join(fixtureBase, dataset, 'source')
  process.env['INPUT_BUILD_DIR'] = join(fixtureBase, dataset, 'build')
  process.env['INPUT_FORMAT'] = format
}

function destroyInput() {
  delete process.env['INPUT_SOURCE_DIR']
  delete process.env['INPUT_BUILD_DIR']
  delete process.env['INPUT_FORMAT']
}

describe('ctest-build-summary action', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = setupGitHub()
  })

  afterEach(() => {
    destroyInput()
    destroyGitHub(tempDir)
  })

  it.each([
    //['raw', 'iwyubuild1'],
    ['tidy', 'tidybuild1']
  ])(
    'format=%s dataset=%s',
    async (format, dataset) => {
      setupInput(format, dataset)

      await run()

      const expectedSummary = readFileSync(
        join(fixtureBase, dataset, 'github_summary'),
        'utf8'
      )
      const actualSummary = readFileSync(
        process.env['GITHUB_STEP_SUMMARY']!,
        'utf8'
      )
      expect(actualSummary.trim()).toEqual(expectedSummary.trim())
    }
  )
})
