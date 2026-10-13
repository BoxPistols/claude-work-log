import { expect, test } from 'claude-code/testing'

import { mask } from './mask'

// 値はすべて架空。形だけを本物に似せている
const cases: [string, string][] = [
  ['export GITHUB_TOKEN=ghp_' + 'a'.repeat(36), 'export GITHUB_TOKEN=•••'],
  ['echo ghp_' + 'b'.repeat(36), 'echo •••'],
  ['curl -H "Authorization: Bearer abcdefgh12345678"', 'curl -H "Authorization: Bearer •••"'],
  ['mysql --password=example-pass', 'mysql --password=•••'],
  ['git clone https://user:example-pass@example.com/repo', 'git clone https://•••@example.com/repo'],
  ['OPENAI_API_KEY="sk-' + 'c'.repeat(24) + '"', 'OPENAI_API_KEY=•••'],
  ['ls -la', 'ls -la'],
]

for (const [input, expected] of cases) {
  test(`伏せ字: ${expected}`, () => {
    expect(mask(input)).toBe(expected)
  })
}

test('秘密鍵のブロックは丸ごと伏せる', () => {
  expect(mask('-----BEGIN OPENSSH PRIVATE KEY-----\nexample\n-----END OPENSSH PRIVATE KEY-----')).toBe('•••')
})
