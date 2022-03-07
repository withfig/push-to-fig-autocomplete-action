import * as github from '@actions/github'
import { AUTOCOMPLETE_DEFAULT_BRANCH, AUTOCOMPLETE_REPO } from './constants'
import { File, Octokit, OctokitError, Repo } from './types'
import { format } from './prettier'
import { lintString } from './eslint'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isFile(value: any): value is File {
  return !Array.isArray(value) && value.type === 'file'
}

export async function createCommitOnNewRepoBranch(
  octokit: Octokit,
  fork: Repo,
  branchName: string,
  changedFile: File
) {
  // create new branch on top of the upstream master
  const masterRef = await octokit.rest.git.getRef({
    ...fork,
    ref: `heads/${AUTOCOMPLETE_DEFAULT_BRANCH}`
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

export async function createAutocompleteRepoPR(
  octokit: Octokit,
  specName: string,
  forkOwner: string,
  branchName: string
) {
  const defaultBranch = await getRepoDefaultBranch(octokit, AUTOCOMPLETE_REPO)
  // create a new branch in the fork and create
  await octokit.rest.pulls.create({
    ...AUTOCOMPLETE_REPO,
    title: `feat(${specName}): update spec`,
    head: `${forkOwner}:${branchName}`,
    base: defaultBranch
  })
}

/**
 * Rebase an autocomplete for on top of the cyrrent autocomplete default branch
 */
async function rebaseOnCurrentDefaultBranch(octokit: Octokit, fork: Repo) {
  const upstreamMaster = await octokit.rest.git.getRef({
    ...AUTOCOMPLETE_REPO,
    ref: `heads/${AUTOCOMPLETE_DEFAULT_BRANCH}`
  })
  const newSha = upstreamMaster.data.object.sha

  await octokit.rest.git.updateRef({
    ...fork,
    ref: `heads/${AUTOCOMPLETE_DEFAULT_BRANCH}`,
    sha: newSha
  })
}

/**
 * Checks if a fork of the autocomplete repo already exists or it creates a new one for the current user
 */
export async function checkOrCreateAutocompleteFork(
  octokit: Octokit
): Promise<Repo> {
  const user = await octokit.rest.users.getAuthenticated()
  const autocompleteForks = await octokit.rest.repos.listForks(
    AUTOCOMPLETE_REPO
  )

  for (let i = 0; i < autocompleteForks.data.length; i++) {
    const fork = autocompleteForks.data[i]
    if (fork.owner.login === user.data.login) {
      const forkData = { owner: fork.owner.login, repo: fork.name }
      await rebaseOnCurrentDefaultBranch(octokit, forkData)
      return forkData
    }
  }

  // TODO: race until the repo is created
  await octokit.rest.repos.createFork(AUTOCOMPLETE_REPO)

  return { owner: user.data.login, repo: 'autocomplete' }
}

/**
 * Gets a spec file from the autocomplete repo
 * @param octokit the Octokit object
 * @param specPath the path to the spec in the default autocomplete repo
 */
export async function getAutocompleteRepoSpec(
  octokit: Octokit,
  specPath: string
): Promise<string | null> {
  let fileData
  try {
    fileData = await octokit.rest.repos.getContent({
      ...AUTOCOMPLETE_REPO,
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
  throw new Error(`spec-path: ${specPath} does not correspond to a valid file`)
}

export async function getRepoDefaultBranch(
  octokit: Octokit,
  repo: typeof github.context.repo
) {
  return (await octokit.rest.repos.get(repo)).data.default_branch
}

export async function getFormattedSpecContent(
  octokit: Octokit,
  specPath: string,
  specName: string
): Promise<string> {
  const specFile = await octokit.rest.repos.getContent({
    path: specPath,
    ...github.context.repo
  })

  if (isFile(specFile.data)) {
    const decodedFile = Buffer.from(specFile.data.content, 'base64').toString()

    const lintedString = lintString(decodedFile, `${specName}.ts`)
    return format(lintedString)
  }
  throw new Error(`spec-path: ${specPath} does not correspond to a valid file`)
}
