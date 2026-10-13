import { expect, test } from 'claude-code/testing'

import { columnsOf, fit } from './width'

test('全角は2列として数える', () => {
  expect(columnsOf('abc')).toBe(3)
  expect(columnsOf('例を表示')).toBe(8)
  expect(columnsOf('例A')).toBe(3)
})

test('表示幅で切り、…を足しても幅を超えない', () => {
  expect(fit('abcdef', 10)).toBe('abcdef')
  expect(fit('abcdef', 4)).toBe('abc…')
  expect(fit('例を表示する', 7)).toBe('例を表…')
  expect(columnsOf(fit('例を表示する', 7))).toBeLessThanOrEqual(7)
  expect(fit('例を表示', 8)).toBe('例を表示')
})
