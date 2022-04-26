import * as core from '@actions/core'
import { execAsync } from './utils'
import { writeFile } from 'fs/promises'

export async function runEslintOnPath(path: string) {
  core.info(`Started running eslint on spec file: ${path}`)
  await writeFile(
    '.tmp-eslintrc',
    '{"root": true,"extends":"@fig/autocomplete"}',
    {
      encoding: 'utf8'
    }
  )
  await execAsync('npm i @fig/eslint-config-autocomplete@latest eslint@latest')
  await execAsync(
    `npx eslint@latest --no-ignore --config .tmp-eslintrc --fix ${path}`
  )
  core.info('Finished running eslint on spec file')
}

export async function runPrettierOnPath(path: string) {
  core.info(`Started running prettier on spec file: ${path}`)
  await execAsync(
    `npx prettier@2 ${path} --no-config --write --parser typescript`
  )
  core.info('Finished running prettier on spec file')
}

export async function lintAndFormatSpec(path: string) {
  await runEslintOnPath(path)
  await runPrettierOnPath(path)
}
