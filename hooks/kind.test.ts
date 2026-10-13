import { expect, test } from 'claude-code/testing'

import { classify } from './kind'

// 出力の向け先だけでは書き換えにしない。値はすべて架空
const cases: [string, ReturnType<typeof classify>][] = [
  ['ls -la 2>/dev/null', 'read'],
  ['find . -name "*.ts" 2>/dev/null | head', 'read'],
  ['cat example.txt > /dev/null', 'read'],
  ['echo example > out.txt', 'write'],
  ['echo example >> out.txt', 'write'],
  ['sed -i "" "s/a/b/" example.txt', 'write'],
  ['git status', 'git'],
  ['npm test', 'check'],
  ['echo example', 'other'],
]

for (const [command, kind] of cases) {
  test(`種類分け: ${command} → ${kind}`, () => {
    expect(classify(command)).toBe(kind)
  })
}
