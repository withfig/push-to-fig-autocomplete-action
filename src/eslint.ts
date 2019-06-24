import { Linter } from 'eslint'

const config: Linter.Config = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@withfig/fig-linter/recommended',
    'plugin:compat/recommended'
  ],
  env: {
    browser: true
  },
  plugins: ['@withfig/fig-linter'],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 0,
    'no-unused-vars': ['off'],
    'no-var': ['off'],
    '@typescript-eslint/no-unused-vars': ['off']
  }
}

const BASE_ERROR_MESSAGE = `The action encountered the following error(s) while linting the generated spec,
if you are using some official integration report the failure to the Fig team to receive help:\n\n\n`

export function lintString(code: string, name: string): string {
  const report = new Linter().verifyAndFix(code, config, name)
  if (report.messages.some(m => m.severity === 2)) {
    throw new Error(
      BASE_ERROR_MESSAGE +
        report.messages
          .map(m => `${m.ruleId} ${m.line}:${m.column} - ${m.message}`)
          .join('\n')
    )
  }
  return report.output
}
