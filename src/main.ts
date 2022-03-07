import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  checkOrCreateAutocompleteFork,
  createAutocompleteRepoPR,
  createCommitOnNewRepoBranch,
  getAutocompleteRepoSpec,
  getFormattedSpecContent
} from './utils'
import mergeSpecs from '@withfig/autocomplete-tools/build/merge'
import { randomUUID } from 'crypto'

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const autocompleteSpecName = core.getInput('autocomplete-spec-name', {
      required: true
    })
    const specPath = core.getInput('spec-path', { required: true })
    const integration = core.getInput('integration')

    const octokit = github.getOctokit(token)

    // get generated spec, run eslint and prettier on top of it and report eventual errors
    let newSpecContent = await getFormattedSpecContent(
      octokit,
      specPath,
      autocompleteSpecName
    )

    // check if spec already exist in autocomplete repo, if it does => run merge tool and merge it
    if (integration) {
      const autocompleteSpec = await getAutocompleteRepoSpec(octokit, specPath)
      if (autocompleteSpec) {
        newSpecContent = mergeSpecs(autocompleteSpec, newSpecContent, {
          preset: integration
        })
      }
    }

    // create autocomplete fork
    const autocompleteFork = await checkOrCreateAutocompleteFork(octokit)

    // commit the file to a new branch on the autocompletefork
    const newBranchName = `auto-update/${autocompleteSpecName}/${randomUUID()}`
    await createCommitOnNewRepoBranch(
      octokit,
      autocompleteFork,
      newBranchName,
      {
        path: `src/${autocompleteSpecName}.ts`,
        content: newSpecContent
      }
    )

    // create a PR from the branch with changes
    await createAutocompleteRepoPR(
      octokit,
      autocompleteSpecName,
      autocompleteFork.owner,
      newBranchName
    )
  } catch (error) {
    core.error((error as Error).message)
  }
}

run()
