import * as core from '@actions/core'

export async function run(): Promise<void> {
  try {
    const isCoolFeatureEnabled = core.getBooleanInput('enable_cool_feature', {
      required: true
    })
    const otherSetting = core.getInput('other_setting', { required: true })
    core.setOutput(
      'super_cool_output',
      `enable_cool_feature=${isCoolFeatureEnabled} other_setting=${otherSetting}`
    )
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err.message)
    } else {
      core.setFailed(`Unknown error: ${err}`)
    }
  }
}
