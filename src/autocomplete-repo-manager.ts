import { File, Octokit, OctokitError, Repo } from './types'
import { isFile } from './utils'

export class AutocompleteRepoManager {
  declare autocompleteRepo: Repo
  declare autocompleteDefaultBranch: string
  constructor(autocompleteRepo: Repo, autocompleteDefaultBranch: string) {
    this.autocompleteRepo = autocompleteRepo
    this.autocompleteDefaultBranch = autocompleteDefaultBranch
  }

  async createCommitOnNewRepoBranch(
    octokit: Octokit,
    fork: Repo,
    branchName: string,
    changedFile: File
  ) {
    // create new branch on top of the upstream master
    const masterRef = await octokit.rest.git.getRef({
      ...fork,
      ref: `heads/${this.autocompleteDefaultBranch}`
    })
    const newBranchRef = await octokit.rest.git.createRef({
      ...fork,
      ref: `refs/heads/${branchName}`,
      sha: masterRef.data.object.sha
    })

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
      base_tree: newBranchRef.data.object.sha
    })

    const newCommit = await octokit.rest.git.createCommit({
      ...fork,
      message: 'feat: update spec',
      tree: newTree.data.sha,
      parents: [newBranchRef.data.object.sha]
    })

    octokit.rest.git.updateRef({
      ...fork,
      ref: `heads/${branchName}`,
      sha: newCommit.data.sha
    })
  }

  async createAutocompleteRepoPR(
    octokit: Octokit,
    specName: string,
    forkOwner: string,
    branchName: string
  ) {
    // create a new branch in the fork and create
    const result = await octokit.rest.pulls.create({
      ...this.autocompleteRepo,
      title: `feat(${specName}): update spec`,
      head: `${forkOwner}:${branchName}`,
      base: this.autocompleteDefaultBranch
    })

    return result.data.number
  }

  /**
   * Rebase an autocomplete for on top of the cyrrent autocomplete default branch
   */
  private async rebaseForkonDefaultBranch(octokit: Octokit, fork: Repo) {
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
  }

  /**
   * Checks if a fork of the autocomplete repo already exists or it creates a new one for the current user
   */
  async checkOrCreateFork(octokit: Octokit): Promise<Repo> {
    const user = await octokit.rest.users.getAuthenticated()
    const autocompleteForks = await octokit.rest.repos.listForks(
      this.autocompleteRepo
    )

    for (let i = 0; i < autocompleteForks.data.length; i++) {
      const fork = autocompleteForks.data[i]
      if (fork.owner.login === user.data.login) {
        const forkData = { owner: fork.owner.login, repo: fork.name }
        await this.rebaseForkonDefaultBranch(octokit, forkData)
        return forkData
      }
    }

    // TODO: race until the repo is created
    await octokit.rest.repos.createFork(this.autocompleteRepo)

    return { owner: user.data.login, repo: 'autocomplete' }
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