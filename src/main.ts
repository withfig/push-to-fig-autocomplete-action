import * as core from '@actions/core'
import * as github from '@actions/github'
import { PresetName, merge as mergeSpecs } from '@fig/autocomplete-merge'
import { getFormattedSpecContent, getRepoDefaultBranch, timeout } from './utils'
import { AutocompleteRepoManager } from './autocomplete-repo-manager'
import { Repo } from './types'
import { randomUUID } from 'crypto'

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const autocompleteSpecName = core.getInput('autocomplete-spec-name', {
      required: true
    })
    const specPath = core.getInput('spec-path', { required: true })
    const integration = core.getInput('integration') as PresetName
    const repoOrg = core.getInput('repo-org')
    const repoName = core.getInput('repo-name')

    const octokit = github.getOctokit(token)

    const repo: Repo = {
      repo: repoName,
      owner: repoOrg
    }
    const autocompleteRepoManager = new AutocompleteRepoManager(
      repo,
      await getRepoDefaultBranch(octokit, repo)
    )

    core.info(
      `Target autocomplete repo: ${JSON.stringify(
        autocompleteRepoManager.repo
      )}`
    )

    // get generated spec, run eslint and prettier on top of it and report eventual errors
    let newSpecContent = await getFormattedSpecContent(octokit, specPath)

    // check if spec already exist in autocomplete repo, if it does => run merge tool and merge it
    const autocompleteSpec = await autocompleteRepoManager.getSpec(
      octokit,
      `src/${autocompleteSpecName}.ts`
    )
    if (autocompleteSpec) {
      core.startGroup('Run merge tool')
      core.info(`Old spec: ${autocompleteSpec}`)
      core.info(`New spec: ${newSpecContent}`)
      core.info(`Settings: ${JSON.stringify({ preset: integration })}`)
      newSpecContent = mergeSpecs(autocompleteSpec, newSpecContent, {
        ...(integration && { preset: integration })
      })
      core.info(`Updated spec: ${newSpecContent}`)
      core.endGroup()
    }

    // create autocomplete fork
    const autocompleteFork = await autocompleteRepoManager.checkOrCreateFork(
      octokit
    )

    // commit the file to a new branch on the autocompletefork
    const newBranchName = `auto-update/${autocompleteSpecName}/${randomUUID()}`
    await autocompleteRepoManager.createCommitOnForkNewBranch(
      octokit,
      autocompleteFork,
      newBranchName,
      {
        path: `src/${autocompleteSpecName}.ts`,
        content: newSpecContent
      }
    )

    // skip 100ms because github returns a validation error otherwise (commit is sync)
    await timeout(100)
    // create a PR from the branch with changes
    const createdPRNumber =
      await autocompleteRepoManager.createAutocompleteRepoPR(
        octokit,
        autocompleteSpecName,
        autocompleteFork.owner,
        newBranchName
      )
    core.setOutput('pr-number', createdPRNumber)
  } catch (error) {
    core.error(
      `${(error as Error).name}: ${(error as Error).message}\n\n${
        (error as Error).stack
      }`
    )
  }
}

run()
