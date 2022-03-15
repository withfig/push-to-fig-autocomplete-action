import { execAsync } from './utils'
import { writeFile } from 'fs/promises'

export async function runEslintOnPath(path: string) {
  await writeFile('.tmp-eslintrc', '{"extends":"@fig/autocomplete"}', {
    encoding: 'utf8'
  })
  await execAsync('npm i @fig/eslint-config-autocomplete')
  await execAsync(`npx eslint@8 --config .tmp-eslintrc --fix ${path}`)
}
