import * as path from 'path'
import * as core from '@actions/core'
import { execAsync } from './utils'
import { writeFile } from 'fs/promises'

async function runEslintOnPath(p: string, cwd: string) {
  core.info(`Started running eslint on spec: ${path.join(cwd, p)}`)
  await writeFile(
    path.join(cwd, '.tmp-eslintrc'),
    '{"root": true,"extends":"@fig/autocomplete"}',
    {
      encoding: 'utf8'
    }
  )
  await execAsync('npm i @fig/eslint-config-autocomplete@latest eslint@8', cwd)
  await execAsync(
    `npx eslint@8 --no-ignore --no-eslintrc --config .tmp-eslintrc --fix ${p}`,
    cwd
  )
  core.info('Finished running eslint on spec file')
}

async function runPrettierOnPath(p: string, cwd: string) {
  core.info(`Started running prettier on spec: ${p}`)
  await execAsync(
    `npx prettier@2 ${p} --no-config --write --parser typescript`,
    cwd
  )
  core.info('Finished running prettier on spec file')
}

export async function lintAndFormatSpec(absolutePath: string, cwd: string) {
  const relativePath = path.relative(cwd, absolutePath)
  await runEslintOnPath(relativePath, cwd)
  await runPrettierOnPath(relativePath, cwd)
}
