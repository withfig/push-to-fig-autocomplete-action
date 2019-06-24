import prettier from 'prettier'

export function format(code: string): string {
  return prettier.format(code, { parser: 'typescript' })
}
