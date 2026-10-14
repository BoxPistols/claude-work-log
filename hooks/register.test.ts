import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const pane = {
  title: '作業の記録',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`行を押すとコマンドの全文と結果が開く(${surface})`, async ($, on) => {
    // エンジンの代わりに成功の結果を返す
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'example-output', stderr: '', interrupted: false } }))

    await $.tool.call({ tool: 'Bash', command: 'D=/example\necho example-tail', description: '例を表示' })
    const ui = await $.ui.mount({ plugin: 'work-log', surface, component: 'Pane', requestId: 'work-log', props: pane })

    expect(await ui.find({ text: /例を表示/ })).toBeDefined()
    expect(await ui.find({ text: /echo example-tail/ })).toBeUndefined()

    const row = await ui.find({ type: 'Button', text: /例を表示/ })
    await ui.press({ key: row?.key ?? '' })

    expect(await ui.find({ text: /echo example-tail/ })).toBeDefined()

    await ui.press({ key: 'close' })
    expect(await ui.find({ text: /echo example-tail/ })).toBeUndefined()
  })
}

test('秘密の値は伏せ字で記録され、パネルにも出ない', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'API_TOKEN=example-secret-value', stderr: '', interrupted: false } }))

  await $.tool.call({ tool: 'Bash', command: 'curl -H "Authorization: Bearer exampletoken123456" https://example.com', description: '例の取得' })
  const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: pane })
  const row = await ui.find({ type: 'Button', text: /例の取得/ })
  await ui.press({ key: row?.key ?? '' })

  expect(await ui.find({ text: /exampletoken123456/ })).toBeUndefined()
  expect(await ui.find({ text: /example-secret-value/ })).toBeUndefined()
  expect(await ui.find({ text: /Bearer •••/ })).toBeDefined()
})

test('凡例を押すと種類で絞り、検索欄で説明を探せる', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'example-output', stderr: '', interrupted: false } }))

  await $.tool.call({ tool: 'Bash', command: 'ls /example', description: '例の一覧' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: '例の検証' })
  await $.tool.call({ tool: 'Bash', command: 'git status', description: '例の状態' })
  const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: pane })

  await ui.press({ key: 'k:check' })
  expect(await ui.find({ type: 'Button', text: /例の検証/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /例の一覧/ })).toBeUndefined()

  // もう一度押すと解除
  await ui.press({ key: 'k:check' })
  expect(await ui.find({ type: 'Button', text: /例の一覧/ })).toBeDefined()

  await ui.input({ key: 'query', text: '状態', kind: 'change' })
  expect(await ui.find({ type: 'Button', text: /例の状態/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /例の検証/ })).toBeUndefined()

  await ui.input({ key: 'query', text: '該当しない語', kind: 'change' })
  expect(await ui.find({ text: /該当なし/ })).toBeDefined()
})

test('並び順は新しい順から始まり、押すと古い順になる', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))

  await $.tool.call({ tool: 'Bash', command: 'echo first', description: '例の一番目' })
  await $.tool.call({ tool: 'Bash', command: 'echo second', description: '例の二番目' })
  const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: pane })

  const firstRow = async () => (await ui.findAll({ type: 'Button', text: /例の/ }))[0]?.key
  expect(await firstRow()).toContain('c:')
  const newest = await firstRow()

  await ui.press({ key: 'order' })
  expect(await ui.find({ text: /古い順/ })).toBeDefined()
  expect(await firstRow()).not.toBe(newest)
})

// エンジンの代わりに、開いたことにして列数と行数だけ控える
const recordOpen = (on: Parameters<TestBody>[1]) => {
  const opened: number[] = []
  const heights: number[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.columns ?? 0)
    heights.push(e.rows ?? 0)
    return { value: { isPlaced: true } }
  })
  return { opened, heights }
}

test('パネルは端末の幅の40%を36〜96列に収めた幅と、一覧が出る高さで開く', async ($, on) => {
  const { opened, heights } = recordOpen(on)

  for (const columns of [200, 120, 60, 300]) {
    await $.command.run({ command: 'work-log', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns } })
  }
  expect(opened).toEqual([80, 48, 36, 96])
  expect(heights).toEqual([12, 12, 12, 12])
})

test('引数に列数を渡すとその幅で開き、範囲の外は端に寄せる', async ($, on) => {
  const { opened } = recordOpen(on)

  for (const args of ['100', ' 64 ', '5', '500', 'wide']) {
    await $.command.run({ command: 'work-log', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  }
  // 数でない引数は指定が無いものとして扱う
  expect(opened).toEqual([100, 64, 20, 200, 48])
})

test('横に置いたときは80列から、入力欄の上では60列から一覧を左右に並べる', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: 'ls /example', description: '例' })

  const sideBySide = async (placement: 'dock' | 'inline', bodyColumns: number) => {
    const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: { ...pane, placement, bodyColumns } })
    // 左右に並べると、一覧の箱は幅の半分になる
    const boxes = await ui.findAll({ type: 'Box' })
    const half = Math.floor((bodyColumns - 2) / 2)
    const found = boxes.some(one => one.props.width === half)
    await ui.unmount()
    return found
  }

  expect(await sideBySide('dock', 79)).toBe(false)
  expect(await sideBySide('dock', 80)).toBe(true)
  expect(await sideBySide('inline', 59)).toBe(false)
  expect(await sideBySide('inline', 60)).toBe(true)
})

test('検索の行では並び順のボタンを検索欄より先に置く', async $ => {
  const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: { ...pane, bodyColumns: 36 } })
  const keys = (await ui.findAll({})).map(one => one.key)

  expect(keys.indexOf('order')).toBeGreaterThan(-1)
  expect(keys.indexOf('order')).toBeLessThan(keys.indexOf('query'))
})

test('種類ごとに行頭の記号が変わる', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))

  await $.tool.call({ tool: 'Bash', command: 'npm test', description: '例の検証' })
  await $.tool.call({ tool: 'Bash', command: 'git status', description: '例の状態' })
  const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: pane })

  expect((await ui.find({ type: 'Button', text: /例の検証/ }))?.text).toMatch(/^▲ /)
  expect((await ui.find({ type: 'Button', text: /例の状態/ }))?.text).toMatch(/^⑂ /)
})

test('実行中の行は回る記号を出し、終わると✓に替わる', async ($, on) => {
  const clock = mock.clock(on)
  let finish = () => {}
  const done = new Promise<void>(resolve => { finish = resolve })
  // 終わらせるまで結果を返さない
  on('tool.call', { tool: 'Bash' }, async () => {
    await done
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })

  const call = $.tool.call({ tool: 'Bash', command: 'sleep 1', description: '例の待機' })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: pane })
  const mark = async () => (await ui.find({ type: 'Button', text: /例の待機/ }))?.text.slice(-1)
  const before = await mark()
  expect(before).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  // 0.1秒進めると記号が替わる
  await clock.advance(100)
  expect(await mark()).not.toBe(before)

  finish()
  await call
  expect((await ui.find({ type: 'Button', text: /例の待機/ }))?.text).toMatch(/✓$/)
})

test('低いパネルでは検索欄を隠して一覧を残す', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))

  await $.tool.call({ tool: 'Bash', command: 'ls /example', description: '例の一覧' })
  const low = { ...pane, placement: 'inline', scroll: { offset: 0, bodyRows: 3 } } as const
  const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: low })

  expect(await ui.find({ key: 'query' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /例の一覧/ })).toBeDefined()
})

test('名前つきの凡例が1行に収まらないときは記号と件数だけにする', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))

  for (const command of ['ls /example', 'touch /example/a', 'npm test', 'git status', 'echo example']) {
    await $.tool.call({ tool: 'Bash', command, description: '例' })
  }
  const narrow = { ...pane, bodyColumns: 30 } as const
  const ui = await $.ui.mount({ plugin: 'work-log', surface: 'terminal', component: 'Pane', requestId: 'work-log', props: narrow })

  expect((await ui.find({ key: 'k:read' }))?.text).toBe('● 1')
  expect(await ui.find({ text: /調べる/ })).toBeUndefined()
})
