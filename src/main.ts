import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import {
  execAsync,
  getMergedSpecContent,
  getRepoDefaultBranch,
  getSpecFileContent,
  lintAndFormatSpec,
  timeout
} from './utils'
import {
  uploadFilePathArtifact,
  uploadFolderPathArtifact,
  uploadStringArtifact
} from './artifact'
import { AutocompleteRepoManager } from './autocomplete-repo-manager'
import { Repo } from './types'
import { randomUUID } from 'crypto'
import { writeFile } from 'fs/promises'

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const autocompleteSpecName = core.getInput('autocomplete-spec-name', {
      required: true
    })
    const specPath = core.getInput('spec-path', { required: true })
    const repoOrg = core.getInput('repo-org')
    const repoName = core.getInput('repo-name')
    const diffBasedVersioning = core.getBooleanInput('diff-based-versioning')

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

    // this is the local path of the updated spec: it will be either a TS file for old-style specs or a folder for spec-folder.
    let localSpecFileOrFolder: string

    if (!diffBasedVersioning) {
      // get generated spec, run eslint and prettier on top of it and report eventual errors
      let newSpecContent = await getSpecFileContent(specPath)

      await uploadFilePathArtifact('new-spec.ts', specPath)
      // check if spec already exist in autocomplete repo, if it does => run merge tool and merge it
      const autocompleteSpecContent = await autocompleteRepoManager.getSpecFile(
        octokit,
        autocompleteSpecName
      )
      if (autocompleteSpecContent) {
        await uploadStringArtifact('old-spec.ts', autocompleteSpecContent)
        newSpecContent = await getMergedSpecContent(
          autocompleteSpecContent,
          newSpecContent
        )
        await uploadStringArtifact('merged-spec.ts', newSpecContent)
      }
      const mergedPath = `${randomUUID()}.ts`
      await writeFile(mergedPath, newSpecContent, { encoding: 'utf8' })
      localSpecFileOrFolder = mergedPath
    } else {
      const newSpecVersion = core.getInput('new-spec-version')
      if (!newSpecVersion) {
        throw new Error(
          'You need to specify `new-spec-version` when using `diff-based-versioning: true`'
        )
      }

      await lintAndFormatSpec(specPath)
      await uploadFilePathArtifact('new-spec.ts', specPath)

      const localSpecFolder = randomUUID()
      const successfullyClonedSpecFolder =
        await autocompleteRepoManager.cloneSpecFolder(
          octokit,
          autocompleteSpecName,
          localSpecFolder
        )

      if (successfullyClonedSpecFolder) {
        await uploadFolderPathArtifact('old-spec-folder', localSpecFolder)
      } else {
        // spec-folder does not exist in autocomplete repo so we create a new one locally and then upload to the autocomplete repo
        await execAsync(
          `mkdir ${localSpecFolder} && cd ${localSpecFolder} && npx @withfig/autocomplete-tools@latest version init-spec ${autocompleteSpecName}`
        )
      }
      await execAsync(
        `cd ${localSpecFolder} && npx @withfig/autocomplete-tools@latest version add-diff ${autocompleteSpecName} ../${specPath} ${newSpecVersion}`
      )

      localSpecFileOrFolder = path.join(localSpecFolder, autocompleteSpecName)
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
      localSpecFileOrFolder
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
