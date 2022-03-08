import { format as prettierFormat } from 'prettier'

export function format(code: string): string {
  return prettierFormat(code, { parser: 'typescript' })
}
