import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as github from '@actions/github'
import { File, Octokit } from './types'
import { format } from './format'

export async function getRepoDefaultBranch(
  octokit: Octokit,
  repo: typeof github.context.repo
) {
  return (await octokit.rest.repos.get(repo)).data.default_branch
}

export async function getFormattedSpecContent(
  specPath: string
): Promise<string> {
  core.info('Started retrieving the new completion spec file...')
  // TODO: load spec from local context
  const specFile = await fs.readFile(specPath, { encoding: 'utf8' })
  core.info('Finished retrieving new completion spec file')

  core.info('Started linting and formatting the new spec...')
  const formatted = format(specFile)
  core.info('Finished linting and formatting the new spec')

  return formatted
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFile(value: any): value is File {
  return !Array.isArray(value) && value.type === 'file'
}

export async function timeout(time: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}
