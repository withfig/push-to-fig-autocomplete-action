import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as github from '@actions/github'
import { File, Octokit } from './types'
import { PresetName, merge as mergeSpecs } from '@fig/autocomplete-merge'
import { readFile, writeFile } from 'fs/promises'
import { exec } from 'child_process'
import { format } from './format'
import { randomUUID } from 'crypto'
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

export async function getMergedSpecContent(oldSpec: string, newSpec: string) {
  const integration = core.getInput('integration') as PresetName
  core.startGroup('Merge specs')

  core.info('Started running merge tool...')
  const mergedSpec = mergeSpecs(oldSpec, newSpec, {
    ...(integration && { preset: integration })
  })
  core.info('Finished running merge tool')
  const tmpFileName = `${randomUUID()}.ts`
  core.info(`Started writing merged spec to '${tmpFileName}'...`)

  await writeFile(tmpFileName, mergedSpec, { encoding: 'utf8' })
  core.info(`Finished writing merged spec`)

  await runEslintOnPath(tmpFileName)
  core.info(`Finished running eslint on merged spec file`)

  core.endGroup()
  return await readFile(tmpFileName, { encoding: 'utf8' })
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
