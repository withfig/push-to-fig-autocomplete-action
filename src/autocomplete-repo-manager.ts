import * as core from '@actions/core'
import { File, Octokit, OctokitError, Repo } from './types'
import { isFile, timeout } from './utils'

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
    changedFile: File
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
    const newBlob = await octokit.rest.git.createBlob({
      ...fork,
      content: changedFile.content,
      encoding: 'utf-8'
    })
    const newTree = await octokit.rest.git.createTree({
      ...fork,
      tree: [
        {
          path: changedFile.path,
          sha: newBlob.data.sha,
          mode: '100644',
          type: 'blob'
        }
      ],
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
   * @param specPath the path relative to `src/` of the spec in the default autocomplete repo, excluding the extension
   */
  async getSpec(octokit: Octokit, specPath: string): Promise<string | null> {
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
      `spec-path: ${specPath} does not correspond to a valid file`
    )
  }
}
