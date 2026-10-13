import { expect, test } from 'claude-code/testing'

import type { CommandEntry } from '../types'
import { latest, pickCommands, pickFiles } from './filter'

// 値はすべて架空
const command = (id: string, kind: CommandEntry['kind'], state: CommandEntry['state'], description: string): CommandEntry =>
  ({ id, command: `echo ${id}`, description, output: '', kind, state })

const list = [
  command('a', 'read', 'ok', '一覧を見る'),
  command('b', 'write', 'failed', '設定を書き換える'),
  command('c', 'check', 'ok', 'テストを実行する'),
  command('d', 'read', 'failed', 'ログを探す'),
]

test('種類で絞る', () => {
  expect(pickCommands(list, 'read', '').map(one => one.id)).toEqual(['a', 'd'])
})

test('失敗だけに絞る', () => {
  expect(pickCommands(list, 'failed', '').map(one => one.id)).toEqual(['b', 'd'])
})

test('説明とコマンドの両方を部分一致で探し、大文字小文字を区別しない', () => {
  expect(pickCommands(list, '', 'テスト').map(one => one.id)).toEqual(['c'])
  expect(pickCommands(list, '', 'ECHO B').map(one => one.id)).toEqual(['b'])
  expect(pickCommands(list, 'read', 'ログ').map(one => one.id)).toEqual(['d'])
})

test('空白だけの検索語は絞らない', () => {
  expect(pickCommands(list, '', '  ')).toHaveLength(4)
})

test('ファイルはパスで探す', () => {
  const files = [{ path: '/example/a.ts', tool: 'Edit', count: 1 }, { path: '/example/b.md', tool: 'Write', count: 2 }]
  expect(pickFiles(files, '.md').map(one => one.path)).toEqual(['/example/b.md'])
})

test('収まる件数だけ最新から取り、新しい順なら最新を上にする', () => {
  expect(latest([1, 2, 3, 4], 2, 'new')).toEqual([4, 3])
  expect(latest([1, 2, 3, 4], 2, 'old')).toEqual([3, 4])
})
