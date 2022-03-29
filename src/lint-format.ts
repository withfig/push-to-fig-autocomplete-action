import * as core from '@actions/core'
import { execAsync } from './utils'
import { format as prettierFormat } from 'prettier'
import { writeFile } from 'fs/promises'

export async function runEslintOnPath(path: string) {
  await writeFile('.tmp-eslintrc', '{"extends":"@fig/autocomplete"}', {
    encoding: 'utf8'
  })
  await execAsync('npm i @fig/eslint-config-autocomplete')
  await execAsync(`npx eslint@8 --config .tmp-eslintrc --fix ${path}`)
}

export async function runPrettierOnPath(path: string) {
  await execAsync(`npx prettier ${path} --parser typescript -w`)
}

export function format(code: string): string {
  return prettierFormat(code, { parser: 'typescript' })
}

export async function lintAndFormatSpec(path: string) {
  core.info('Started running eslint on spec file...')
  await runEslintOnPath(path)
  core.info('Finished running eslint on spec file')

  core.info('Started running prettier on spec file...')
  await runPrettierOnPath(path)
  core.info('Finished running prettier on spec file')
}
