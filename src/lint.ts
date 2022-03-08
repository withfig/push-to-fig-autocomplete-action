// import { ESLint, Linter } from 'eslint'
// import path from 'path'

// const config: Linter.Config = {
//   parser: '@typescript-eslint/parser',
//   parserOptions: {
//     ecmaVersion: 2020,
//     sourceType: 'module'
//   },
//   extends: [
//     'plugin:@typescript-eslint/recommended',
//     'plugin:@withfig/fig-linter/recommended',
//     'plugin:compat/recommended'
//   ],
//   env: {
//     browser: true
//   },
//   plugins: ['@withfig/fig-linter'],
//   rules: {
//     '@typescript-eslint/explicit-module-boundary-types': 0,
//     'no-unused-vars': ['off'],
//     'no-var': ['off'],
//     '@typescript-eslint/no-unused-vars': ['off']
//   }
// }

// const BASE_ERROR_MESSAGE = `The action encountered the following error(s) while linting the generated spec,
// if you are using some official integration report the failure to the Fig team to receive help:\n\n\n`

// export async function lintString(
//   code: string,
//   specPath: string
// ): Promise<string> {
//   const eslint = new ESLint({
//     resolvePluginsRelativeTo: path.join(process.cwd(), 'dist'),
//     baseConfig: config,
//     fix: true,
//     useEslintrc: false
//   })
//   const [lintResult] = await eslint.lintText(code, { filePath: specPath })
//   if (lintResult.errorCount > lintResult.fixableErrorCount) {
//     throw new Error(
//       BASE_ERROR_MESSAGE +
//         lintResult.messages
//           .map(m => `${m.ruleId} ${m.line}:${m.column} - ${m.message}`)
//           .join('\n')
//     )
//   }
//   return lintResult.output || code
// }
