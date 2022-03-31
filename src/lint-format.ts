import * as core from '@actions/core'
import { execAsync } from './utils'
import { writeFile } from 'fs/promises'

export async function runEslintOnPath(path: string) {
  core.info(`Started running eslint on spec file: ${path}`)
  await writeFile('.tmp-eslintrc', '{"extends":"@fig/autocomplete"}', {
    encoding: 'utf8'
  })
  await execAsync('npm i @fig/eslint-config-autocomplete')
  await execAsync(`npx eslint@8 --config .tmp-eslintrc --fix ${path}`)
  core.info('Finished running eslint on spec file')
}

export async function runPrettierOnPath(path: string) {
  core.info(`Started running prettier on spec file: ${path}`)
  await execAsync(`npx prettier ${path} --parser typescript -w`)
  core.info('Finished running prettier on spec file')
}

export async function lintAndFormatSpec(path: string) {
  await runEslintOnPath(path)
  await runPrettierOnPath(path)
}