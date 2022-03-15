import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as github from '@actions/github'
import { File, Octokit } from './types'
import { exec } from 'child_process'
import { format } from './format'
import { runEslintOnPath } from './lint'

export async function getRepoDefaultBranch(
  octokit: Octokit,
  repo: typeof github.context.repo
) {
  return (await octokit.rest.repos.get(repo)).data.default_branch
}

export async function getFormattedSpecContent(
  specPath: string
): Promise<string> {
  core.startGroup('Linting and formatting the generated spec')
  core.info('Started running eslint...')
  try {
    await runEslintOnPath(specPath)
  } catch (error) {
    core.error(
      `The following error was encountered while running eslint on ${specPath}:\n${
        (error as Error).stack || (error as Error).message
      }`
    )
  }
  core.info('Finished running eslint...')
  core.info('Started reading the new completion spec file from the fs...')
  const specFile = await fs.readFile(specPath, { encoding: 'utf8' })
  core.info('Finished reading the new completion spec file from the fs')

  core.info('Started linting and formatting the new spec...')
  const formatted = format(specFile)
  core.info('Finished linting and formatting the new spec')
  core.endGroup()
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

export async function execAsync(
  command: string
): Promise<{ stdout: string; stderr: string }> {
  const trimmed = (b: string) => String(b).trim()

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) return reject(error)
      resolve({ stdout: trimmed(stdout), stderr: trimmed(stderr) })
    })
  })
}
