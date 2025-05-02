import * as core from '@actions/core'
import * as github from '@actions/github'
import { summary } from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import { XMLParser } from 'fast-xml-parser'

interface BuildIssue {
  isError: boolean
  text: string
  sourceFile?: string
  sourceLine?: number
  postContext?: string
}

type SummaryAlert = {
  type: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CRITICAL'
  text: string
}

type SummaryIssue = {
  headers: SummaryAlert[]
  sourceFile?: string
  sourceLine?: number
  messageType?: string
  message?: string
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

function summaryWriteIssue(issue: SummaryIssue) {
  summary.addEOL()
  for (const header of issue.headers) {
    summary.addRaw(`[!${header.type}] ${header.text}`)
    summary.addEOL()
  }
  if (issue.sourceFile) {
    const repo = github.context.repo
    let linkUrl = `https://github.com/${repo.owner}/${repo.repo}/blob/${github.context.sha}/${issue.sourceFile}`
    let linkText = issue.sourceFile
    if (issue.sourceLine) {
      linkUrl += `#L${issue.sourceLine}`
      linkText += `:${issue.sourceLine}`
    }
    summary.addRaw(`[${linkText}](${linkUrl})`)
    summary.addEOL()
  }
  if (issue.message) {
    if (issue.messageType) {
      summary.addRaw('```${issue.messageType}')
    } else {
      summary.addRaw('```')
    }
    summary.addEOL()
    summary.addRaw(issue.message)
    summary.addEOL()
    summary.addRaw('```')
    summary.addEOL()
  }
}

function reStickyMatch(re: RegExp, str: string): RegExpExecArray | null {
  re.lastIndex = 0
  return re.exec(str)
}

function summarizeTidy(buildIssues: BuildIssue[]) {
  let summaryIssue: SummaryIssue | undefined

  const alertType = (txt: string) => {
    if (txt == 'warning') return 'WARNING'
    if (txt == 'error') return 'CRITICAL'
    if (txt == 'note') return 'NOTE'
    return 'IMPORTANT'
  }

  const textRe = /([^ ]+: )?((\w+): )(.*)/y
  const generateAlert = (issue: BuildIssue): SummaryAlert => {
    if (issue.text) {
      textRe.lastIndex = 0
      const textMatch = reStickyMatch(textRe, issue.text)
      if (textMatch) {
        return { type: alertType(textMatch[3]), text: textMatch[4] }
      }
      return { type: issue.isError ? 'CRITICAL' : 'WARNING', text: issue.text }
    }
    return { type: issue.isError ? 'CRITICAL' : 'WARNING', text: '' }
  }

  const contextLineRe = /( +(\d+ )?\|[^\n]*\n?)+/y
  const cleanupPostContext = (postContext: string | undefined) => {
    if (!postContext) {
      return postContext
    }
    const match = reStickyMatch(contextLineRe, postContext)
    return match ? match[0].trimEnd() : undefined
  }

  for (const buildIssue of buildIssues) {
    const currentAlert = generateAlert(buildIssue)
    if (!summaryIssue) {
      summaryIssue = {
        headers: [currentAlert],
        sourceFile: buildIssue.sourceFile,
        sourceLine: buildIssue.sourceLine,
        message: cleanupPostContext(buildIssue.postContext)
      }
    } else {
      if (
        currentAlert.type == 'NOTE' &&
        summaryIssue.sourceFile &&
        buildIssue.sourceFile &&
        summaryIssue.sourceFile == buildIssue.sourceFile &&
        summaryIssue.sourceLine &&
        buildIssue.sourceLine &&
        summaryIssue.sourceLine == buildIssue.sourceLine
      ) {
        summaryIssue.headers.push(currentAlert)
      } else {
        summaryWriteIssue(summaryIssue)
        summaryIssue = {
          headers: [currentAlert],
          sourceFile: buildIssue.sourceFile,
          sourceLine: buildIssue.sourceLine,
          message: cleanupPostContext(buildIssue.postContext)
        }
      }
    }
  }

  if (summaryIssue) {
    summaryWriteIssue(summaryIssue)
  }
}

function summarizeRaw(buildIssues: BuildIssue[]) {
  for (const buildIssue of buildIssues) {
    summaryWriteIssue({
      headers: [
        {
          type: buildIssue.isError ? 'CRITICAL' : 'WARNING',
          text: buildIssue.text
        }
      ],
      sourceFile: buildIssue.sourceFile,
      sourceLine: buildIssue.sourceLine,
      message: buildIssue.postContext
    })
  }
}

export async function run(): Promise<void> {
  try {
    const sourceDir = getInputOrEnv('source_dir', 'CI_SOURCE_DIR')
    const buildDir = getInputOrEnv('build_dir', 'CI_BUILD_DIR')
    const format = core.getInput('format') || 'tidy'
    core.info(`sourceDir=${sourceDir}`)
    core.info(`buildDir=${buildDir}`)
    core.info(`format=${format}`)

    const mostRecentTestingDir = findMostRecentTestingDir(buildDir)
    const buildXmlPath = path.join(mostRecentTestingDir, 'Build.xml')

    if (!fs.existsSync(buildXmlPath)) {
      throw new Error(`Build.xml not found at expected path: ${buildXmlPath}`)
    }

    const buildXmlContent = fs.readFileSync(buildXmlPath, 'utf-8')
    const parser = new XMLParser({ ignoreAttributes: false, trimValues: false })
    const parsed = parser.parse(buildXmlContent)

    const buildIssues: BuildIssue[] = []

    const buildElement = parsed.Site?.Build
    if (!buildElement) {
      throw new Error('No Build elements found')
    } else {
      const builds = Array.isArray(buildElement) ? buildElement : [buildElement]
      for (const build of builds) {
        for (const [key, value] of Object.entries(build)) {
          if (key === 'Warning' || key === 'Error') {
            const isError = key == 'Error'
            const items = Array.isArray(value) ? value : [value]
            for (const item of items) {
              buildIssues.push({
                isError: isError,
                text: item.Text ?? '(no text)',
                sourceFile: item.SourceFile ?? undefined,
                sourceLine: item.SourceLineNumber ?? undefined,
                postContext: item.PostContext ?? undefined
              })
            }
          }
        }
      }
    }

    summary.addRaw('## Build Summary')
    summary.addEOL()

    if (format === 'tidy') {
      summarizeTidy(buildIssues)
    } else {
      summarizeRaw(buildIssues)
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
