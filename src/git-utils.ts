import * as github from '@actions/github'
import * as path from 'path'
import { Blob, Octokit, Repo } from './types'
import { readFile, readdir } from 'fs/promises'

export async function getDefaultBranch(
  octokit: Octokit,
  repo: typeof github.context.repo
) {
  return (await octokit.rest.repos.get(repo)).data.default_branch
}

export async function createFileBlob(
  octokit: Octokit,
  repo: Repo,
  filePath: string
): Promise<Blob> {
  const newBlob = await octokit.rest.git.createBlob({
    ...repo,
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

export async function createFolderBlobs(
  octokit: Octokit,
  repo: Repo,
  basePath: string
): Promise<Blob[]> {
  const dirents = await readdir(basePath, {
    withFileTypes: true
  })
  const blobs = []
  for (const dirent of dirents) {
    if (dirent.isFile()) {
      blobs.push(
        await createFileBlob(octokit, repo, path.join(basePath, dirent.name))
      )
    } else if (dirent.isDirectory()) {
      blobs.push(
        ...(await createFolderBlobs(
          octokit,
          repo,
          path.join(basePath, dirent.name)
        ))
      )
    }
  }
  return blobs
}
