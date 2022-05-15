import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import { FileOrFolder, Repo } from './types'
import { execAsync, mergeSpecs, timeout } from './utils'
import { uploadFilepathArtifact, uploadFolderPathArtifact } from './artifact'
import { AutocompleteRepoManager } from './autocomplete-repo-manager'
import { TMP_FOLDER } from './constants'
import { getDefaultBranch } from './git-utils'
import { lintAndFormatSpec } from './lint-format'
import { randomUUID } from 'crypto'
import { copyFile } from 'fs/promises'
import { existsSync } from 'fs'

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const autocompleteSpecName = core.getInput('autocomplete-spec-name', {
      required: true
    })
    // The local path of the new spec relative to the repo root e.g. `fig_cli/generated-fig.ts`
    const newSpecPathInRepo = core.getInput('spec-path', { required: true })
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
      await getDefaultBranch(octokit, repo),
      octokit
    )

    core.info(
      `Target autocomplete repo: ${JSON.stringify(
        autocompleteRepoManager.repo
      )}`
    )

    // The path to the spec copied to the temp directory
    if (!existsSync(TMP_FOLDER)) throw new Error('NON ESISTE')
    const newSpecPath = path.join(TMP_FOLDER, `${randomUUID()}.ts`)
    // this is the local path of the updated spec: it will be either a TS file for old-style specs or a folder for diff-versioned.
    let localSpecFileOrFolder: FileOrFolder
    // Run eslint and prettier on top of the generated spec and report eventual errors
    await copyFile(path.resolve(newSpecPathInRepo), newSpecPath)
    await lintAndFormatSpec(newSpecPath, TMP_FOLDER)
    await uploadFilepathArtifact('new-spec.ts', newSpecPath)

    if (!diffBasedVersioning) {
      // check if spec already exist in autocomplete repo, if it does => run merge tool and merge it
      const oldSpecPath = path.join(TMP_FOLDER, 'old-spec.ts')
      const successfullyClonedSpecFile =
        await autocompleteRepoManager.cloneFile(
          `src/${autocompleteSpecName}.ts`,
          oldSpecPath
        )
      await uploadFilepathArtifact('old-spec.ts', oldSpecPath)

      const mergedSpecPath = path.join(TMP_FOLDER, 'merged-spec.ts')
      if (successfullyClonedSpecFile) {
        await mergeSpecs(oldSpecPath, newSpecPath, mergedSpecPath, TMP_FOLDER)
        await uploadFilepathArtifact('merged-spec.ts', mergedSpecPath)
      }
      localSpecFileOrFolder = {
        localPath: successfullyClonedSpecFile ? mergedSpecPath : newSpecPath,
        repoPath: `src/${autocompleteSpecName}.ts`
      }
    } else {
      const newSpecVersion = core.getInput('new-spec-version')
      const useMinorBase = core.getBooleanInput('use-minor-base')
      if (!newSpecVersion) {
        throw new Error(
          'You need to specify `new-spec-version` when using `diff-based-versioning: true`'
        )
      }

      const localSpecFolder = path.join(TMP_FOLDER, autocompleteSpecName)
      const successfullyClonedSpecFolder =
        await autocompleteRepoManager.cloneSpecFolder(
          `src/${autocompleteSpecName}`,
          localSpecFolder
        )

      if (successfullyClonedSpecFolder) {
        await uploadFolderPathArtifact('old-spec-folder', localSpecFolder)
      } else {
        // spec-folder does not exist in autocomplete repo so we create a new one locally and then upload to the autocomplete repo
        await execAsync(
          `npx @withfig/autocomplete-tools@2 version init-spec ${autocompleteSpecName} --cwd ${localSpecFolder}`
        )
      }
      await execAsync(
        `npx @withfig/autocomplete-tools@2 version add-diff ${
          useMinorBase ? '--use-minor-base' : ''
        } ${autocompleteSpecName} ${path.resolve(
          newSpecPath
        )} ${newSpecVersion} --cwd ${TMP_FOLDER}`
      )

      await lintAndFormatSpec(autocompleteSpecName, TMP_FOLDER)

      localSpecFileOrFolder = {
        repoPath: `src/${autocompleteSpecName}`,
        localPath: localSpecFolder
      }
    }

    // create autocomplete fork
    const basePRsBranchName = `auto-update/${autocompleteSpecName}`
    const autocompleteFork = await autocompleteRepoManager.checkOrCreateFork(
      basePRsBranchName
    )

    // commit the file to a new branch on the autocompletefork
    const newBranchName = `${basePRsBranchName}/${randomUUID()}`
    const commitHasDiff =
      await autocompleteRepoManager.createCommitOnForkNewBranch(
        autocompleteFork,
        newBranchName,
        localSpecFileOrFolder
      )

    if (commitHasDiff) {
      // skip 500ms because github returns a validation error otherwise (commit is sync)
      await timeout(500)
      // create a PR from the branch with changes
      const createdPRNumber =
        await autocompleteRepoManager.createAutocompleteRepoPR(
          autocompleteSpecName,
          autocompleteFork.owner,
          newBranchName
        )
      core.setOutput('pr-number', createdPRNumber)
    } else {
      core.info('No diffs found between old and new specs')
    }
  } catch (error) {
    core.error(
      `${(error as Error).name}: ${(error as Error).message}\n\n${
        (error as Error).stack
      }`
    )
  }
}

run()
