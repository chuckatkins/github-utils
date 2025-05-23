import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as yaml from 'js-yaml'
import { minimatch } from 'minimatch'
import * as fs from 'fs'

type ChangedFile = {
  status: string
  path: string
}

async function gitRefExistsLocally(
  ref: string,
  gitDir?: string
): Promise<boolean> {
  const options = {
    cwd: gitDir,
    silent: true,
    ignoreReturnCode: true
  }

  const args = ['rev-parse', '--verify', '--quiet', ref]

  core.debug(`Running: git ${args.join(' ')}`)
  const exitCode = await exec.exec('git', args, options)

  return exitCode === 0
}

async function gitFetch(
  remote: string,
  ref: string,
  gitDir?: string
): Promise<void> {
  const options = { cwd: gitDir }
  const args = ['fetch', remote, ref]

  core.debug(`Running: git ${args.join(' ')}`)
  await exec.exec('git', args, options)
}

async function gitDiffFiles(
  from: string,
  to: string,
  gitDir?: string
): Promise<ChangedFile[]> {
  let output = ''

  const options = {
    cwd: gitDir,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      }
    }
  }

  const args = ['diff', '--name-status', from, to]

  core.debug(`Running: git ${args.join(' ')}`)
  const exitCode = await exec.exec('git', args, options)
  if (exitCode !== 0) {
    throw new Error(`git diff exited with code ${exitCode}`)
  }

  return output
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map(([status, ...rest]) => ({
      status,
      path: rest.join(' ')
    }))
}

async function writeSummary(
  changedFiles: ChangedFile[],
  groupMatches: Record<string, ChangedFile[]>
): Promise<void> {
  core.summary
    .addHeading('Changed Files Summary', 2)
    .addHeading('All Changes', 3)
    .addRaw(`${changedFiles.length} file(s) changed.`, true)
    .addTable([
      [
        { data: 'Group', header: true },
        { data: 'Matched Files', header: true }
      ],
      ...Object.entries(groupMatches).map(([group, files]) => [
        {
          data: `<a href="#group-${group.toLowerCase()}">${group}</a>`,
          raw: true
        },
        files.length.toString()
      ])
    ])
    .addEOL()

  for (const [group, files] of Object.entries(groupMatches)) {
    core.summary
      .addRaw(`<a name="group-${group.toLowerCase()}"></a>`, true)
      .addHeading(`Group ${group}`, 3)

    if (files.length > 0) {
      core.summary.addRaw(`Matched files: ${files.length}`, true)

      const diffLines = files.map(({ path, status }) => {
        if (status === 'A') return `+ ${path}`
        if (status === 'D') return `- ${path}`
        return `  ${path}` // e.g. modified or renamed
      })

      core.summary.addCodeBlock(diffLines.join('\n'), 'diff')
    }
  }

  await core.summary.write()
}

export async function run(): Promise<void> {
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH!
    const eventName = process.env.GITHUB_EVENT_NAME!
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))

    let base: string, head: string
    if (eventName === 'pull_request') {
      base = eventData.pull_request.base.sha
      head = eventData.pull_request.head.sha
    } else if (eventName === 'push') {
      base = eventData.before
      head = eventData.after
    } else {
      base = 'origin/main'
      head = 'HEAD'
    }

    const repoPath = core.getInput('path', { required: true })

    core.startGroup('Git')
    if (await gitRefExistsLocally(base, repoPath)) {
      core.info(`Skipping fetch base=${base} (already exists)`)
    } else {
      core.info(`Fetching base=${base}`)
      await gitFetch('origin', base, repoPath)
    }
    if (await gitRefExistsLocally(head, repoPath)) {
      core.info(`Skipping fetch head=${head} (already exists)`)
    } else {
      core.info(`Fetching head=${head}`)
      await gitFetch('origin', head, repoPath)
    }

    core.info('Computing Diff')
    const changedFiles = await gitDiffFiles(base, head, repoPath)
    core.endGroup()

    core.startGroup('All changed files')
    core.setOutput('all', changedFiles.length.toString())
    if (changedFiles.length > 0) {
      console.log(`${changedFiles.length} file(s) changed`)
      for (const f of changedFiles) {
        const flog =
          f.status === 'A'
            ? `+ ${f.path}`
            : f.status === 'D'
              ? `- ${f.path}`
              : f.status === 'M'
                ? `* ${f.path}`
                : `  ${f.path}`

        console.log(flog)
      }
    } else {
      console.log('No changed files')
    }
    core.endGroup()

    const filtersYaml = core.getInput('filters', { required: true })
    const filters: Record<string, string[]> = yaml.load(
      filtersYaml
    ) as unknown as Record<string, string[]>
    if (!Object.prototype.hasOwnProperty.call(filters, 'ci')) {
      filters['ci'] = ['.github/**']
    }

    const groupMatches: Record<string, ChangedFile[]> = {}
    for (const [group, patterns] of Object.entries(filters)) {
      core.startGroup(`Filter group ${group}`)
      const matched = changedFiles.filter((f) =>
        patterns.some((pattern) => minimatch(f.path, pattern))
      )

      groupMatches[group] = matched
      core.setOutput(group, matched.length.toString())

      if (matched.length > 0) {
        console.log(`${matched.length} file(s) matched`)
        for (const f of matched) {
          const flog =
            f.status === 'A'
              ? `+ ${f.path}`
              : f.status === 'D'
                ? `- ${f.path}`
                : `  ${f.path}`

          console.log(flog)
        }
      } else {
        console.log(`No matched files`)
      }
      core.endGroup()
    }

    core.setOutput('all', changedFiles.length.toString())

    if (core.getBooleanInput('summary', { required: true })) {
      await writeSummary(changedFiles, groupMatches)
    }
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err.message)
    } else {
      core.setFailed(`Unknown error: ${err}`)
    }
  }
}
