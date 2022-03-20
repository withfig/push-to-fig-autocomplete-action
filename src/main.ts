import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import {
  getMergedSpecContent,
  getRepoDefaultBranch,
  getSpecFileContent,
  timeout
} from './utils'
import { uploadPathArtifact, uploadStringArtifact } from './artifact'
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
    let newSpecContent = await getSpecFileContent(specPath)
    core.info(`Spec absolute path: ${path.resolve('.', specPath)}`)

    await uploadPathArtifact('new-spec.ts', specPath)
    // check if spec already exist in autocomplete repo, if it does => run merge tool and merge it
    const autocompleteSpecContent = await autocompleteRepoManager.getSpec(
      octokit,
      `src/${autocompleteSpecName}.ts`
    )
    if (autocompleteSpecContent) {
      await uploadStringArtifact('old-spec.ts', autocompleteSpecContent)
      newSpecContent = await getMergedSpecContent(
        autocompleteSpecContent,
        newSpecContent
      )
      await uploadStringArtifact('merged-spec.ts', newSpecContent)
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
