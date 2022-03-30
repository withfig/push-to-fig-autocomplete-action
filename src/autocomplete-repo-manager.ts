import * as core from '@actions/core'
import * as path from 'path'
import { Octokit, OctokitError, Repo } from './types'
import { createFileBlob, createFolderBlobs } from './git-utils'
import { isFile, timeout } from './utils'
import { mkdir, writeFile } from 'fs/promises'

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
      ? [await createFileBlob(octokit, fork, localSpecFileOrFolder)]
      : await createFolderBlobs(octokit, fork, localSpecFileOrFolder)
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
   * @param repoFilepath a path of a file in the repo
   * @param destinationPath the file path in which to write the `repoFilepath` file
   */
  async cloneFile(
    octokit: Octokit,
    repoFilepath: string,
    destinationPath: string
  ) {
    core.startGroup('Starting to clone file...')
    core.info(
      `Cloning ${repoFilepath} from repo: ${JSON.stringify(
        this.autocompleteRepo
      )} into ${destinationPath}`
    )
    let fileData
    try {
      core.info('Started fetching file content...')
      fileData = await octokit.rest.repos.getContent({
        ...this.autocompleteRepo,
        path: repoFilepath
      })
      core.info('Finished fetching file content')
    } catch (error) {
      if ((error as OctokitError).status === 404) {
        core.info('File not found in autocomplete repo')
        core.endGroup()
        return false
      }
      throw error
    }
    if (!isFile(fileData.data)) {
      throw new Error(
        `autocomplete-spec-name: ${repoFilepath} does not correspond to a valid file`
      )
    }

    await mkdir(path.dirname(destinationPath))
    core.info(`Started writing file...`)
    await writeFile(
      destinationPath,
      Buffer.from(fileData.data.content, 'base64').toString(),
      { encoding: 'utf8' }
    )
    core.info(`Finished writing file`)
    core.endGroup()
    return true
  }

  /**
   * Gets a spec folder from the autocomplete repo
   * @param octokit the Octokit object
   * @param repoFolderPath the path of a folder in the repo
   * @param destinationFolderPath the local directory in which to write the contents of the `repoFolderPath` directory
   */
  async cloneSpecFolder(
    octokit: Octokit,
    repoFolderPath: string,
    destinationFolderPath: string
  ) {
    core.startGroup('Starting to clone folder...')
    core.info(
      `Cloning ${repoFolderPath} from repo: ${JSON.stringify(
        this.autocompleteRepo
      )} into ${destinationFolderPath}`
    )
    let folderData
    try {
      core.info('Started fetching file content...')
      folderData = (
        await octokit.rest.repos.getContent({
          ...this.autocompleteRepo,
          path: repoFolderPath
        })
      ).data
      core.info('Finished fetching file content')
    } catch (error) {
      if ((error as OctokitError).status === 404) {
        core.info('Folder not found in autocomplete repo')
        core.endGroup()
        return false
      }
      throw error
    }

    if (!Array.isArray(folderData)) {
      // this may only be reached by the first iteration
      throw new Error(
        `autocomplete-spec-name: ${repoFolderPath} does not correspond to a valid spec folder`
      )
    }

    await mkdir(destinationFolderPath, { recursive: true })

    for (const item of folderData) {
      if (item.type === 'dir') {
        core.info(`Object at ${repoFolderPath}/${item.path} is a folder`)
        await this.cloneSpecFolder(
          octokit,
          `${repoFolderPath}/${item.path}`,
          path.join(destinationFolderPath, item.path)
        )
      } else if (isFile(item)) {
        core.info(`Object at ${repoFolderPath}/${item.path} is a file`)
        core.info(`Started writing file...`)
        await writeFile(
          path.join(destinationFolderPath, item.path),
          Buffer.from(item.content, 'base64').toString()
        )
        core.info(`Finished writing file`)
      }
    }
    core.endGroup()
    return true
  }
}
