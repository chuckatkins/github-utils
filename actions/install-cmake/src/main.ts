import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import * as tc from '@actions/tool-cache'
import * as path from 'path'
import * as os from 'os'

function getPlatform(): string {
  const platform = os.platform()
  const arch = os.arch()
  if (platform === 'linux')
    return arch === 'x64' ? 'linux-x86_64' : 'linux-aarch64'
  if (platform === 'darwin')
    return arch === 'x64' ? 'macos-universal' : 'macos-arm64'
  if (platform === 'win32') return 'windows-x86_64'
  throw new Error(`Unsupported platform: ${platform}-${arch}`)
}

type AssetURL = {
  version: string
  url: string
}

async function resolveGitHubAssetURL(
  owner: string,
  repo: string,
  version: string,
  assetTemplate: string
): Promise<AssetURL> {
  const token =
    core.getInput('token', { required: false }) || process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GitHub API token not provided')
  }
  const gh = getOctokit(token)

  let resolvedVersion = version
  let release

  if (version === 'latest') {
    release = await gh.rest.repos.getLatestRelease({ owner, repo })
    resolvedVersion = release.data.tag_name.replace(/^v/, '')
  } else {
    release = await gh.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag: `v${version}`
    })
  }

  const expectedAssetName = assetTemplate.replace('<version>', resolvedVersion)

  const asset = release.data.assets.find((a) => a.name === expectedAssetName)
  if (!asset) {
    throw new Error(
      `Asset not found: ${expectedAssetName} in ${owner}/${repo}@${resolvedVersion}`
    )
  }

  return { version: resolvedVersion, url: asset.browser_download_url }
}

async function getCMakeDownloadURL(version: string): Promise<AssetURL> {
  const platform = getPlatform()
  const ext = platform.startsWith('windows') ? 'zip' : 'tar.gz'
  const assetTemplate = `cmake-<version>-${platform}.${ext}`
  return await resolveGitHubAssetURL('Kitware', 'CMake', version, assetTemplate)
}

async function getNinjaDownloadURL(version: string): Promise<AssetURL> {
  const platform = os.platform()
  const filename =
    platform === 'win32'
      ? 'ninja-win.zip'
      : platform === 'linux'
      ? 'ninja-linux.zip'
      : platform === 'darwin'
      ? 'ninja-mac.zip'
      : (() => {
          throw new Error(`Unsupported platform: ${platform}`)
        })()

  return await resolveGitHubAssetURL('ninja-build', 'ninja', version, filename)
}

async function installToolFromURL(
  tool: string,
  version: string,
  url: string,
  binSubdir: string,
  stripFirst: boolean = false
): Promise<string> {
  core.startGroup(`${tool} tool-cache`)

  // First: check if the tool is already in the cache
  const cachedPath = tc.find(tool, version)
  if (cachedPath) {
    core.info(`Found ${tool}@${version} in tool-cache: ${cachedPath}`)
    core.endGroup()
    return path.join(cachedPath, binSubdir)
  }

  // Not cached — download and extract
  core.info(`Not found in cache, downloading ${url}`)
  const archivePath = await tc.downloadTool(url)

  const tarFlags = ['-x']
  if (stripFirst) {
    tarFlags.push('--strip-components=1')
  }
  const archiveFilename = path.basename(url)
  core.info(`Extracting ${archiveFilename}`)
  const extractedPath = url.endsWith('.zip')
    ? await tc.extractZip(archivePath)
    : await tc.extractTar(archivePath, undefined, tarFlags)

  const toolPath = await tc.cacheDir(extractedPath, tool, version)
  core.info(`Cached ${tool}@${version} to: ${toolPath}`)

  core.endGroup()
  return path.join(toolPath, binSubdir)
}

export async function run(): Promise<void> {
  try {
    const version = core.getInput('version', { required: true })
    const installNinja = core.getBooleanInput('install_ninja', {
      required: true
    })
    const ninjaVersion = core.getInput('ninja_version', { required: true })

    const cmakeUrl = await getCMakeDownloadURL(version)
    core.info(`Downloading CMake from: ${cmakeUrl.url}`)
    const cmakeBinDir = await installToolFromURL(
      'cmake',
      cmakeUrl.version,
      cmakeUrl.url,
      'bin',
      true
    )
    core.addPath(cmakeBinDir)

    core.setOutput(
      'cmake',
      path.join(cmakeBinDir, os.platform() === 'win32' ? 'cmake.exe' : 'cmake')
    )
    core.setOutput(
      'ctest',
      path.join(cmakeBinDir, os.platform() === 'win32' ? 'ctest.exe' : 'ctest')
    )

    if (installNinja) {
      const ninjaUrl = await getNinjaDownloadURL(ninjaVersion)
      const ninjaBinDir = await installToolFromURL(
        'ninja',
        ninjaUrl.version,
        ninjaUrl.url,
        '.',
        false
      )
      core.addPath(ninjaBinDir)
      core.setOutput(
        'ninja',
        path.join(
          ninjaBinDir,
          os.platform() === 'win32' ? 'ninja.exe' : 'ninja'
        )
      )
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}
