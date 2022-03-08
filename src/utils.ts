import * as github from '@actions/github'
import { File, Octokit } from './types'
import { format } from './prettier'
import { lintString } from './eslint'

export async function getRepoDefaultBranch(
  octokit: Octokit,
  repo: typeof github.context.repo
) {
  return (await octokit.rest.repos.get(repo)).data.default_branch
}

export async function getFormattedSpecContent(
  octokit: Octokit,
  specPath: string
): Promise<string> {
  const specFile = await octokit.rest.repos.getContent({
    ...github.context.repo,
    path: specPath
  })

  if (isFile(specFile.data)) {
    const decodedFile = Buffer.from(specFile.data.content, 'base64').toString()

    const lintedString = await lintString(decodedFile, specPath)
    return format(lintedString)
  }
  throw new Error(`spec-path: ${specPath} does not correspond to a valid file`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFile(value: any): value is File {
  return !Array.isArray(value) && value.type === 'file'
}
