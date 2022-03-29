import * as core from '@actions/core'
import * as path from 'path'
import { Blob, Octokit, OctokitError, Repo } from './types'
import { isFile, timeout } from './utils'
import { mkdir, readFile, readdir, writeFile } from 'fs/promises'

export class AutocompleteRepoManagerError extends Error {}

export class AutocompleteRepoManager {
  private declare autocompleteRepo: Repo
  private declare autocompleteDefaultBranch: string

  get repo() {
    return {
      ...this.autocompleteRepo,
      defaultBranch: this.autocompleteDefaultBranch
    }
  }

  constructor(autocompleteRepo: Repo, autocompleteDefaultBranch: string) {
    this.autocompleteRepo = autocompleteRepo
    this.autocompleteDefaultBranch = autocompleteDefaultBranch
  }

  async createCommitOnForkNewBranch(
    octokit: Octokit,
    fork: Repo,
    branchName: string,
    localSpecFileOrFolder: string
  ) {
    const createFileBlob = async (filePath: string): Promise<Blob> => {
      const newBlob = await octokit.rest.git.createBlob({
        ...fork,
        content: await readFile(filePath, {
          encoding: 'utf8'
        }),
        encoding: 'utf-8'
      })
      return {
        path: path.join('src', filePath),
        sha: newBlob.data.sha,
        mode: '100644',
        type: 'blob'
      }
    }
    const createFolderBlobs = async (basePath: string): Promise<Blob[]> => {
      const dirents = await readdir(localSpecFileOrFolder, {
        withFileTypes: true
      })
      const blobs = []
      for (const dirent of dirents) {
        if (dirent.isFile()) {
          // create blob for this file
          blobs.push(await createFileBlob(path.join(basePath, dirent.name)))
        } else if (dirent.isDirectory()) {
          blobs.push(
            ...(await createFolderBlobs(path.join(basePath, dirent.name)))
          )
        }
      }
      return blobs
    }

    core.startGroup('commit')
    // create new branch on top of the upstream master
    const masterRef = await octokit.rest.git.getRef({
      ...fork,
      ref: `heads/${this.autocompleteDefaultBranch}`
    })

    const lastMainBranchCommit = await octokit.rest.repos.listCommits({
      ...fork,
      per_page: 1,
      page: 1
    })

    // create new branch
    await octokit.rest.git.createRef({
      ...fork,
      ref: `refs/heads/${branchName}`,
      sha: masterRef.data.object.sha
    })

    core.info(`Created a new branch on the fork: refs/heads/${branchName}`)

    // create new blob, new tree, commit everything and update PR branch
    const blobs = localSpecFileOrFolder.endsWith('.ts')
      ? [await createFileBlob(localSpecFileOrFolder)]
      : await createFolderBlobs(localSpecFileOrFolder)
    const newTree = await octokit.rest.git.createTree({
      ...fork,
      tree: blobs,
      base_tree: lastMainBranchCommit.data[0].commit.tree.sha
    })

    const newCommit = await octokit.rest.git.createCommit({
      ...fork,
      message: 'feat: update spec',
      tree: newTree.data.sha,
      parents: [lastMainBranchCommit.data[0].sha]
    })

    core.info(`Created new commit: ${newCommit.data.sha}`)

    octokit.rest.git.updateRef({
      ...fork,
      ref: `heads/${branchName}`,
      sha: newCommit.data.sha,
      force: true
    })

    core.info('Updated the created branch to point to the new commit')
    core.endGroup()
  }

  async createAutocompleteRepoPR(
    octokit: Octokit,
    specName: string,
    forkOwner: string,
    branchName: string
  ) {
    const prBody =
      core.getInput('pr-body') ||
      'PR generated automatically from push-to-fig-autocomplete-action.'
    // create a new branch in the fork and create
    const result = await octokit.rest.pulls.create({
      ...this.autocompleteRepo,
      title: `feat(${specName}): update spec`,
      head: `${forkOwner}:${branchName}`,
      base: this.autocompleteDefaultBranch,
      body: prBody
    })
    core.info(
      `Created target autocomplete repo PR (#${result.data.number}) from branch ${forkOwner}:${branchName}`
    )

    return result.data.number
  }

  /**
   * Rebase an autocomplete fork on top of the current autocomplete default branch
   */
  private async rebaseForkOnDefaultBranch(octokit: Octokit, fork: Repo) {
    const upstreamMaster = await octokit.rest.git.getRef({
      ...this.autocompleteRepo,
      ref: `heads/${this.autocompleteDefaultBranch}`
    })
    const newSha = upstreamMaster.data.object.sha

    await octokit.rest.git.updateRef({
      ...fork,
      ref: `heads/${this.autocompleteDefaultBranch}`,
      sha: newSha
    })
    core.info(
      `Rebased ${JSON.stringify(fork)} on top of 'heads/${
        this.autocompleteDefaultBranch
      }'`
    )
  }

  /**
   * Checks if a fork of the autocomplete repo already exists or it creates a new one for the current user
   */
  async checkOrCreateFork(octokit: Octokit): Promise<Repo> {
    const user = await octokit.rest.users.getAuthenticated()
    core.info(`Authenticated user: ${user.data.login}`)

    const autocompleteForks = await octokit.rest.repos.listForks(
      this.autocompleteRepo
    )

    for (let i = 0; i < autocompleteForks.data.length; i++) {
      const fork = autocompleteForks.data[i]
      if (fork.owner.login === user.data.login) {
        core.info('A fork of the target autocomplete repo already exists')
        const forkData = { owner: fork.owner.login, repo: fork.name }
        await this.rebaseForkOnDefaultBranch(octokit, forkData)
        return forkData
      }
    }

    const createdFork = await octokit.rest.repos.createFork(
      this.autocompleteRepo
    )
    await timeout(15_000) // wait 15 seconds to let github create the new repo (it may take longer and require the action to be rerun)
    core.info(
      `Created fork: ${createdFork.data.owner.login}/${createdFork.data.name}`
    )

    return { owner: user.data.login, repo: createdFork.data.name }
  }

  /**
   * Gets a spec file from the autocomplete repo
   * @param octokit the Octokit object
   * @param specName the path relative to `src/` of the spec in the default autocomplete repo, excluding the extension
   */
  async getSpecFile(
    octokit: Octokit,
    specName: string
  ): Promise<string | null> {
    const specPath = `src/${specName}.ts`
    let fileData
    try {
      fileData = await octokit.rest.repos.getContent({
        ...this.autocompleteRepo,
        path: specPath
      })
    } catch (error) {
      if ((error as OctokitError).status === 404) {
        return null
      }
      throw error
    }
    if (isFile(fileData.data)) {
      return Buffer.from(fileData.data.content, 'base64').toString()
    }
    throw new Error(
      `autocomplete-spec-name: 'src/' + ${specName} + '.ts' does not correspond to a valid file`
    )
  }

  /**
   * Gets a spec folder from the autocomplete repo
   * @param octokit the Octokit object
   * @param relativeFolderPath the path relative to `src/` of the folder spec in the default autocomplete repo, excluding the extension
   * @param localDirectory the local directory in which to write the spec
   * @returns a promise containing the localDirectory
   */
  async cloneSpecFolder(
    octokit: Octokit,
    relativeFolderPath: string,
    localDirectory: string
  ) {
    const folderPath = `src/${relativeFolderPath}`
    // get and save recursively the files
    let folderData
    try {
      folderData = (
        await octokit.rest.repos.getContent({
          ...this.autocompleteRepo,
          path: folderPath
        })
      ).data
    } catch (error) {
      if ((error as OctokitError).status === 404) {
        return false
      }
      throw error
    }

    if (Array.isArray(folderData)) {
      for (const item of folderData) {
        if (item.type === 'dir') {
          // parse to localDirectory + relativeFolder
          await mkdir(path.join(localDirectory, relativeFolderPath), {
            recursive: true
          })
          await this.cloneSpecFolder(octokit, item.path, relativeFolderPath)
        } else if (isFile(item)) {
          await writeFile(
            path.join(
              localDirectory,
              relativeFolderPath,
              path.basename(item.path)
            ),
            Buffer.from(item.content, 'base64').toString()
          )
        }
      }
      return true
    }
    // this may only be reached by the first iteration
    throw new Error(
      `autocomplete-spec-name: 'src/' + ${relativeFolderPath} does not correspond to a valid spec folder`
    )
  }
}
