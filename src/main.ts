import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import { execAsync, mergeSpecs, timeout } from './utils'
import { uploadFilepathArtifact, uploadFolderPathArtifact } from './artifact'
import { AutocompleteRepoManager } from './autocomplete-repo-manager'
import { Repo } from './types'
import { TMP_FOLDER } from './constants'
import { getDefaultBranch } from './git-utils'
import { lintAndFormatSpec } from './lint-format'
import { randomUUID } from 'crypto'

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const autocompleteSpecName = core.getInput('autocomplete-spec-name', {
      required: true
    })
    const newSpecPath = core.getInput('spec-path', { required: true })
    const repoOrg = core.getInput('repo-org')
    const repoName = core.getInput('repo-name')
    const diffBasedVersioning =
      core.getBooleanInput('diff-based-versioning') ?? false

    const octokit = github.getOctokit(token)

    const repo: Repo = {
      repo: repoName,
      owner: repoOrg
    }
    const autocompleteRepoManager = new AutocompleteRepoManager(
      repo,
      await getDefaultBranch(octokit, repo)
    )

    core.info(
      `Target autocomplete repo: ${JSON.stringify(
        autocompleteRepoManager.repo
      )}`
    )

    // this is the local path of the updated spec: it will be either a TS file for old-style specs or a folder for spec-folder.
    let localSpecFileOrFolder: string
    // run eslint and prettier on top of the generated spec and report eventual errors
    await lintAndFormatSpec(newSpecPath)
    await uploadFilepathArtifact('new-spec.ts', newSpecPath)

    if (!diffBasedVersioning) {
      // check if spec already exist in autocomplete repo, if it does => run merge tool and merge it
      const oldSpecPath = path.join(TMP_FOLDER, 'old-spec.ts')
      const successfullyClonedSpecFile =
        await autocompleteRepoManager.cloneFile(
          octokit,
          `src/${autocompleteSpecName}.ts`,
          oldSpecPath
        )
      await uploadFilepathArtifact('old-spec.ts', oldSpecPath)

      const mergedSpecPath = path.join(TMP_FOLDER, 'merged-spec.ts')
      if (successfullyClonedSpecFile) {
        await mergeSpecs(oldSpecPath, newSpecPath, mergedSpecPath)
        await uploadFilepathArtifact('merged-spec.ts', mergedSpecPath)
        localSpecFileOrFolder = mergedSpecPath
      } else {
        localSpecFileOrFolder = newSpecPath
      }
    } else {
      const newSpecVersion = core.getInput('new-spec-version')
      if (!newSpecVersion) {
        throw new Error(
          'You need to specify `new-spec-version` when using `diff-based-versioning: true`'
        )
      }

      const localSpecFolder = path.join(TMP_FOLDER, autocompleteSpecName)
      const successfullyClonedSpecFolder =
        await autocompleteRepoManager.cloneSpecFolder(
          octokit,
          `src/${autocompleteSpecName}`,
          localSpecFolder
        )

      if (successfullyClonedSpecFolder) {
        await uploadFolderPathArtifact('old-spec-folder', localSpecFolder)
      } else {
        // spec-folder does not exist in autocomplete repo so we create a new one locally and then upload to the autocomplete repo
        await execAsync(
          `mkdir -p ${localSpecFolder} && cd ${localSpecFolder} && npx @withfig/autocomplete-tools@latest version init-spec ${autocompleteSpecName}`
        )
      }
      await execAsync(
        `cd ${TMP_FOLDER} && npx @withfig/autocomplete-tools@latest version add-diff ${autocompleteSpecName} ${path.resolve(
          newSpecPath
        )} ${newSpecVersion}`
      )

      localSpecFileOrFolder = localSpecFolder
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

    // skip 500ms because github returns a validation error otherwise (commit is sync)
    await timeout(500)
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
