import * as core from '@actions/core'
import * as github from '@actions/github'
import { summary } from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import { XMLParser } from 'fast-xml-parser'

interface BuildIssue {
  type: 'error' | 'warning' | 'note'
  text: string
  sourceFile?: string
  sourceLine?: number
  postContext?: string
}

function getInputOrEnv(input: string, envVar: string): string {
  const value = core.getInput(input)
  if (value) {
    return value
  }
  const env = process.env[envVar]
  if (env) {
    return env
  }
  throw new Error(
    `Missing required input '${input}' or environment variable '${envVar}'`
  )
}

function findMostRecentTestingDir(buildDir: string): string {
  const testingPath = path.join(buildDir, 'Testing')
  const subdirs = fs
    .readdirSync(testingPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((name) => /^\d{8}-\d{4}$/.test(name)) // Match CTest timestamps
    .sort()
  if (subdirs.length === 0) {
    throw new Error(
      `No Testing/* timestamp directories found in ${testingPath}`
    )
  }
  return path.join(testingPath, subdirs[subdirs.length - 1])
}

async function summarizeTidy(
  issues: BuildIssue[],
  sourceDir: string
): Promise<void> {
  let lastMainIssue: BuildIssue | undefined

  for (const issue of issues) {
    if (issue.type === 'error' || issue.type === 'warning') {
      const heading = issue.type === 'error' ? 'ERROR' : 'WARNING'
      await summary.addHeading(`[!${heading}] ${issue.text}`, 3)

      if (issue.sourceFile && issue.sourceLine) {
        const relPath = path.relative(sourceDir, issue.sourceFile)
        const repo = github.context.repo
        const url = `https://github.com/${repo.owner}/${repo.repo}/blob/${github.context.sha}/${relPath}#L${issue.sourceLine}`
        await summary.addLink(`${relPath}:${issue.sourceLine}`, url)
        await summary.addEOL()
      }

      lastMainIssue = issue

      if (issue.postContext) {
        await summary.addCodeBlock(issue.postContext, 'diff')
      }
    } else if (issue.type === 'note' && lastMainIssue) {
      await summary.addHeading(`[!NOTE] ${issue.text}`, 4)
    }
  }
}

async function summarizeRaw(issues: BuildIssue[]): Promise<void> {
  for (const issue of issues) {
    await summary.addHeading(`[${issue.type.toUpperCase()}] ${issue.text}`, 3)
    if (issue.postContext) {
      await summary.addCodeBlock(issue.postContext, 'diff')
    }
  }
}

export async function run(): Promise<void> {
  try {
    const sourceDir = getInputOrEnv('source_dir', 'CI_SOURCE_DIR')
    const buildDir = getInputOrEnv('build_dir', 'CI_BUILD_DIR')
    const format = core.getInput('format') || 'tidy'

    const mostRecentTestingDir = findMostRecentTestingDir(buildDir)
    const buildXmlPath = path.join(mostRecentTestingDir, 'Build.xml')

    if (!fs.existsSync(buildXmlPath)) {
      throw new Error(`Build.xml not found at expected path: ${buildXmlPath}`)
    }

    const buildXmlContent = fs.readFileSync(buildXmlPath, 'utf-8')
    const parser = new XMLParser({ ignoreAttributes: false })
    const parsed = parser.parse(buildXmlContent)

    const buildIssues: BuildIssue[] = []

    const buildTest = parsed.Site?.Testing?.BuildTest
    if (!buildTest || !buildTest.BuildLog) {
      core.warning('No BuildTest/BuildLog entries found')
    } else {
      const entries = Array.isArray(buildTest.BuildLog)
        ? buildTest.BuildLog
        : [buildTest.BuildLog]

      for (const entry of entries) {
        const typeAttr = entry['@_Type']?.toLowerCase()
        if (!typeAttr) continue
        const type =
          typeAttr === 'warning' || typeAttr === 'error' || typeAttr === 'note'
            ? typeAttr
            : 'note'

        buildIssues.push({
          type,
          text: entry.Text?.['#text'] || '(no text)',
          sourceFile: entry.SourceFile,
          sourceLine: entry.SourceLineNumber
            ? parseInt(entry.SourceLineNumber)
            : undefined,
          postContext: entry.PostContext?.['#text']
        })
      }
    }

    await summary.addHeading('Build Summary', 2)

    if (format === 'tidy') {
      await summarizeTidy(buildIssues, sourceDir)
    } else {
      await summarizeRaw(buildIssues)
    }

    await summary.write()
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err.message)
    } else {
      core.setFailed(`Unknown error: ${err}`)
    }
  }
}
