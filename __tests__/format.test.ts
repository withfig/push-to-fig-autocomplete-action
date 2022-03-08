import { expect, test } from '@jest/globals'
import { format } from '../src/format'

const file = `const completionSpec: Fig.CompletionSpec = {name: "foo", description: 'Single quoted.'}`
test('Should parse and run the default prettier configuration on a string', () => {
  expect(typeof format(file)).toEqual('string')
})
