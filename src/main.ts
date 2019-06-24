import * as core from '@actions/core'
import * as github from '@actions/github'
import { format } from './prettier'
import { lintString } from './eslint'
import { randomUUID } from 'crypto'

type Octokit = ReturnType<typeof github.getOctokit>

type Repo = { owner: string; repo: string }

async function rebaseOnCurrentMaster(octokit: Octokit, fork: Repo) {
  const upstreamMaster = await octokit.rest.git.getRef({
    repo: 'autocomplete',
    owner: 'withfig',
    ref: 'heads/master'
  })
  const newSha = upstreamMaster.data.object.sha

  await octokit.rest.git.updateRef({
    ...fork,
    ref: 'heads/master',
    sha: newSha
  })
}

async function checkOrCreateAutocompleteFork(octokit: Octokit): Promise<Repo> {
  const user = await octokit.rest.users.getAuthenticated()
  const autocompleteForks = await octokit.rest.repos.listForks({
    owner: 'withfig',
    repo: 'autocomplete'
  })

  for (let i = 0; i < autocompleteForks.data.length; i++) {
    const fork = autocompleteForks.data[i]
    if (fork.owner.login === user.data.login) {
      const forkData = { owner: fork.owner.login, repo: fork.name }
      await rebaseOnCurrentMaster(octokit, forkData)
      return forkData
    }
  }

  // TODO: race until the repo is created
  await octokit.rest.repos.createFork({
    owner: 'withfig',
    repo: 'autocomplete'
  })

  return { owner: user.data.login, repo: 'autocomplete' }
}

interface File {
  path: string
  content: string
}

async function getDefaultBranch(
  octokit: Octokit,
  repo: typeof github.context.repo
) {
  return (await octokit.rest.repos.get(repo)).data.default_branch
}

async function createCommitOnNewBranch(
  octokit: Octokit,
  fork: Repo,
  branchName: string,
  changedFile: File
) {
  // create new branch on top of the upstream master
  const masterRef = await octokit.rest.git.getRef({
    ...fork,
    ref: 'heads/master'
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

async function createAutocompletePR(
  octokit: Octokit,
  specName: string,
  forkOwner: string,
  branchName: string
) {
  const defaultBranch = await getDefaultBranch(octokit, {
    repo: 'autocomplete',
    owner: 'withfig'
  })
  // create a new branch in the fork and create
  await octokit.rest.pulls.create({
    repo: 'autocomplete',
    owner: 'withfig',
    title: `feat(${specName}): update spec`,
    head: `${forkOwner}:${branchName}`,
    base: defaultBranch
  })
}

async function getFormattedSpecContent(
  octokit: Octokit,
  specPath: string,
  specName: string
): Promise<string> {
  const specFile = await octokit.rest.repos.getContent({
    path: specPath,
    ...github.context.repo
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isFile(file: any): asserts file is { content: string } {
    if (Array.isArray(specFile.data) || specFile.data.type !== 'file')
      throw new Error(
        `spec-path: ${specPath} does not correspond to a valid file`
      )
  }

  isFile(specFile.data)

  const decodedFile = Buffer.from(specFile.data.content, 'base64').toString()

  const lintedString = lintString(decodedFile, `${specName}.ts`)
  return format(lintedString)
}

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    const autocompleteSpecName = core.getInput('autocomplete-spec-name', {
      required: true
    })
    const specPath = core.getInput('spec-path', { required: true })

    const octokit = github.getOctokit(token)

    // get generated spec, run eslint and prettier on top of it and report eventual errors
    const generatedSpecContent = await getFormattedSpecContent(
      octokit,
      specPath,
      autocompleteSpecName
    )

    // create autocomplete fork
    const autocompleteFork = await checkOrCreateAutocompleteFork(octokit)

    // commit the file to a new branch on the autocompletefork
    const newBranchName = `auto-update/${autocompleteSpecName}/${randomUUID()}`
    await createCommitOnNewBranch(octokit, autocompleteFork, newBranchName, {
      path: `src/${autocompleteSpecName}.ts`,
      content: generatedSpecContent
    })

    // create a PR from the branch with changes
    await createAutocompletePR(
      octokit,
      autocompleteSpecName,
      autocompleteFork.owner,
      newBranchName
    )
  } catch (error) {
    core.error((error as Error).message)
  }
}

run()
