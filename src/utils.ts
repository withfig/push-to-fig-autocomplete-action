import * as core from '@actions/core'
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
  core.info('Started retrieving the new completion spec from the repo...')
  const specFile = await octokit.rest.repos.getContent({
    ...github.context.repo,
    path: specPath
  })
  core.info('Finished retrieving new completion spec from the repo')

  if (isFile(specFile.data)) {
    core.info('Started decoding the new spec...')
    const decodedFile = Buffer.from(specFile.data.content, 'base64').toString()
    core.info('Finished decoding the new spec')

    core.info('Started linting and formatting the new spec...')
    const lintedString = await lintString(decodedFile, specPath)
    const formatted = format(lintedString)
    core.info('Finished linting and formatting the new spec')
    return formatted
  }
  throw new Error(`spec-path: ${specPath} does not correspond to a valid file`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFile(value: any): value is File {
  return !Array.isArray(value) && value.type === 'file'
}
