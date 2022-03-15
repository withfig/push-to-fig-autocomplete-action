import * as core from '@actions/core'
import * as github from '@actions/github'
import { File, Octokit } from './types'
import { PresetName, merge as mergeSpecs } from '@fig/autocomplete-merge'
import { readFile, writeFile } from 'fs/promises'
import { exec } from 'child_process'
import { existsSync } from 'fs'
import { format } from './format'
import { randomUUID } from 'crypto'
import { runEslintOnPath } from './lint'

export async function getRepoDefaultBranch(
  octokit: Octokit,
  repo: typeof github.context.repo
) {
  return (await octokit.rest.repos.get(repo)).data.default_branch
}

export async function getSpecFileContent(specPath: string): Promise<string> {
  core.startGroup('Linting and formatting the generated spec')
  const lintedFormattedSpec = await lintAndFormatSpec(specPath)
  core.endGroup()
  return lintedFormattedSpec
}

export async function getMergedSpecContent(oldSpec: string, newSpec: string) {
  const integration = core.getInput('integration') as PresetName
  core.startGroup('Merge specs')

  core.info('Started running merge tool...')
  const mergedSpec = mergeSpecs(oldSpec, newSpec, {
    ...(integration && { preset: integration }),
    prettifyOutput: false
  })
  const lintedFormattedSpec = await lintAndFormatSpec(mergedSpec)
  core.endGroup()
  return lintedFormattedSpec
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

export async function lintAndFormatSpec(
  contentOrPath: string
): Promise<string> {
  let fileName: string
  if (existsSync(contentOrPath)) {
    fileName = contentOrPath
  } else {
    fileName = `${randomUUID()}.ts`
    core.info(`Started writing spec to '${fileName}'...`)
    await writeFile(fileName, contentOrPath, { encoding: 'utf8' })
    core.info(`Finished writing spec`)
  }

  core.info(`Started running eslint on spec file...`)
  await runEslintOnPath(fileName)
  core.info(`Finished running eslint on spec file`)

  core.info(`Started running prettier on spec...`)
  const formattedFile = format(await readFile(fileName, { encoding: 'utf8' }))
  core.info(`Finished running prettier on spec`)
  return formattedFile
}
