import { expect, test } from '@jest/globals'
import { lintString } from '../src/eslint'
import { format } from '../src/prettier'

const file = `const completionSpec: Fig.CompletionSpec = {name: "foo", description: 'Single quoted.'}`

test('Should parse and run the default eslint configuration on a string', async () => {
  const expected = `const completionSpec: Fig.CompletionSpec = {name: "foo", description: 'Single quoted'}`
  expect(await lintString(file)).toEqual(expected)
})

test('Should parse and run the default prettier configuration on a string', () => {
  expect(typeof format(file)).toEqual('string')
})
