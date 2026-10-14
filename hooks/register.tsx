import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { CommandEntry, FileEntry, Filter, Order } from '../types'
import { latest, pickCommands, pickFiles } from './filter'
import { classify, KIND_COLOR, KIND_LABEL, KIND_MARK, KIND_ORDER } from './kind'
import { mask } from './mask'
import { columnsOf, fit } from './width'

const PANE = 'work-log'
const TITLE = '作業の記録'
// 横に置いたパネルが端末の幅に占める割合と、その列数の下限・上限
const SHARE = 0.4
const MIN_COLUMNS = 36
const MAX_COLUMNS = 96
// `/work-log 80`のように列数を指定されたときに受け付ける範囲
const ARG_MIN = 20
const ARG_MAX = 200
// コマンドとファイルの一覧を左右に並べる幅。これ未満では上下に積む
// 入力欄の上は高さが少なく、積むと一覧が半分になるので、横に置くときより狭い幅から左右に並べる
const WIDE = { dock: 80, inline: 60 } as const
// 入力欄の上に置くときの高さ。見出し2行の下に一覧が出る分を取る。右に置くときは使われない
const ROWS = 12
// 再読み込みしても記録が消えないよう$.stateに持つ
const files = atom({ plugin: 'work-log', key: 'files' } as const, [] as FileEntry[])
const commands = atom({ plugin: 'work-log', key: 'commands' } as const, [] as CommandEntry[])
const selected = atom({ plugin: 'work-log', key: 'selected' } as const, '')
const filter = atom({ plugin: 'work-log', key: 'filter' } as const, '' as Filter)
const query = atom({ plugin: 'work-log', key: 'query' } as const, '')
const order = atom({ plugin: 'work-log', key: 'order' } as const, 'new' as Order)

// 長いパスは末尾の2階層だけ見せる
const shortPath = (path: string) => path.split('/').slice(-2).join('/')
// 詳細に出す行数の上限
const headLines = (text: string, max: number) => text.split('\n').filter(Boolean).slice(0, max)

// 状態は記号と色で示す
const MARK = { runs: '…', ok: '✓', failed: '✗' } as const
// 実行中の行だけ回る記号にする。動かすのはここ1か所に限る
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPIN_MS = 100
let running = 0
let frame = 0
let spinner: { cancel: () => void } | undefined
// 見出しの検索欄を出すのに要る、一覧の最低行数
const MIN_LIST = 2
const COLOR = { runs: 'warning', ok: 'inactive', failed: 'error' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'work-log',
      description: '変更したファイルと実行したコマンドをパネルに出す',
    })

    return next(e)
  })

  on('command.run', { command: 'work-log' }, async ($, e) => {
    // 引数に列数があればそれを使う。無ければ端末の幅の40%を36〜96列に収める。幅が届かないときは80列とみなす
    const asked = Number.parseInt(e.args.trim(), 10)
    const columns = Number.isInteger(asked)
      ? Math.min(ARG_MAX, Math.max(ARG_MIN, asked))
      : Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.floor((e.presentation?.columns ?? 80) * SHARE)))
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE, columns, rows: ROWS })

    return { text: isPlaced ? '作業の記録を開きました' : '作業の記録は画面の幅が空くと表示されます' }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Edit' || e.tool === 'Write') {
      const ran = await next(e)
      if (ran.deny === undefined && ran.isError !== true) {
        const path = e.file_path
        await update($, files, list => {
          const found = list.find(one => one.path === path)
          const rest = list.filter(one => one.path !== path)
          return [...rest, { path, tool: e.tool, count: (found?.count ?? 0) + 1 }].slice(-100)
        })
      }
      return ran
    }

    if (e.tool === 'Bash') {
      const entry: CommandEntry = {
        id: e.tool_use_id,
        command: mask(e.command),
        description: mask(e.description ?? ''),
        output: '',
        kind: classify(e.command),
        state: 'runs',
      }
      await update($, commands, list => [...list, entry].slice(-100))
      // 実行中のコマンドがある間だけ描き直す。無くなったら止める
      running += 1
      try {
        spinner ??= $.clock.every(SPIN_MS, () => {
          frame = (frame + 1) % SPIN.length
          $.ui.invalidate('ui.render')
        })
      } catch {
        // 時計が使えない環境では止まった記号のまま記録だけ続ける
      }
      const ran = await next(e).finally(() => {
        running -= 1
        if (running === 0) {
          spinner?.cancel()
          spinner = undefined
        }
      })
      const state: CommandEntry['state'] = ran.deny === undefined && ran.isError !== true ? 'ok' : 'failed'
      // 結果は先頭3行・300字だけを伏せ字にしてから持つ
      const output = mask(headLines(ran.deny ?? ran.text ?? '', 3).join('\n').slice(0, 300))
      await update($, commands, list =>
        list.map(one => (one.id === entry.id ? { ...one, state, output } : one)),
      )
      return ran
    }

    return next(e)
  }).catch(($, e, next) => next(e)) // 記録に失敗してもツールの実行は止めない

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // スマートフォンのアプリには入力欄が無いので、そこでは検索欄を出さない
    const Input = 'Input' in elements ? elements.Input : undefined
    const fileList = await read($, files)
    const commandList = await read($, commands)
    const open = await read($, selected)
    const picked = await read($, filter)
    const words = await read($, query)
    const sort = await read($, order)
    // 同じ行をもう一度押すと閉じる
    const toggle = (id: string) => () => update($, selected, now => (now === id ? '' : id))
    // 同じ凡例をもう一度押すと絞り込みを解く
    const pick = (next: Filter) => () => update($, filter, now => (now === next ? '' : next))
    const columns = Math.max(20, e.props.bodyColumns)
    const stateMark = (state: CommandEntry['state']) => (state === 'runs' ? SPIN[frame] : MARK[state])

    // 詳細を開いているときは一覧の代わりに詳細を出す
    const openCommand = commandList.find(one => `c:${one.id}` === open)
    if (openCommand) {
      return (
        <Box flexDirection="column">
          <Button plain key="close" onPress={toggle(open)}>
            <Text color={KIND_COLOR[openCommand.kind ?? 'other']}>{KIND_MARK[openCommand.kind ?? 'other']}</Text>{' '}
            {openCommand.description || '説明なし'}{' '}
            <Text color={COLOR[openCommand.state]}>{stateMark(openCommand.state)}</Text>
            <Text dimColor>  閉じる</Text>
          </Button>
          {headLines(openCommand.command, 8).map(line => (
            <Text color="suggestion">{line}</Text>
          ))}
          {headLines(openCommand.output, 3).map(line => (
            <Text dimColor>{line}</Text>
          ))}
        </Box>
      )
    }
    const openFile = fileList.find(one => `f:${one.path}` === open)
    if (openFile) {
      return (
        <Box flexDirection="column">
          <Button plain key="close" onPress={toggle(open)}>
            {shortPath(openFile.path)}
            <Text dimColor>  閉じる</Text>
          </Button>
          <Text color="suggestion">{openFile.path}</Text>
          <Text dimColor>{openFile.tool}で{openFile.count}回変更</Text>
        </Box>
      )
    }

    // 端末全体ではなくパネル本体の行数と幅で割り付ける
    const rows = Math.max(1, e.props.scroll.bodyRows)
    const isWide = columns >= WIDE[e.props.placement]
    const width = isWide ? Math.floor((columns - 2) / 2) : columns
    // 見出しは流れと凡例（狭いときは2行）、検索欄。低いときは検索欄を隠して一覧を残す
    const headRows = isWide ? 1 : 2
    const hasSearch = rows - headRows - 1 >= (isWide ? MIN_LIST : MIN_LIST * 2)
    const listRows = rows - headRows - (hasSearch ? 1 : 0)
    const room = Math.max(1, isWide ? listRows : Math.floor(listRows / 2))

    // 流れ: 1コマンド1マスを古い順に並べる。失敗は赤の✗
    const flow = commandList.slice(-Math.max(1, width - 5)).map(one =>
      one.state === 'failed' ? <Text color="error">✗</Text>
      : one.state === 'runs' ? <Text color={KIND_COLOR[one.kind ?? 'other']}>…</Text>
      : <Text color={KIND_COLOR[one.kind ?? 'other']}>■</Text>,
    )
    // 凡例は押すとその種類だけに絞る。選んでいない種類は薄くする
    const failures = commandList.filter(one => one.state === 'failed').length
    const counts = [
      ...KIND_ORDER.map(kind => ({
        key: kind as Filter,
        mark: KIND_MARK[kind],
        color: KIND_COLOR[kind],
        label: KIND_LABEL[kind],
        count: commandList.filter(one => (one.kind ?? 'other') === kind).length,
      })),
      { key: 'failed' as Filter, mark: '✗', color: 'error', label: '失敗', count: failures },
    ].filter(one => one.count > 0 || picked === one.key)
    // 名前つきで1行に収まらないときは記号と件数だけにして、見出しを折り返さない
    const fullWidth = counts.reduce((sum, one) => sum + columnsOf(`${one.mark} ${one.label} ${one.count}`) + 2, -2)
    const isShort = fullWidth > width
    const legend = counts.map(one => (
      <Button plain key={`k:${one.key}`} onPress={pick(one.key)}>
        <Text dimColor={picked !== '' && picked !== one.key}>
          <Text color={one.color}>{one.mark}</Text>{isShort ? '' : ` ${one.label}`} {one.count}
        </Text>
      </Button>
    ))
    const shownCommands = latest(pickCommands(commandList, picked, words), room, sort)
    const shownFiles = latest(pickFiles(fileList, words), room, sort)

    const commandBox = (
      <Box flexDirection="column" width={width}>
        {shownCommands.length === 0 && <Text dimColor>{commandList.length === 0 ? 'コマンドなし' : '該当なし'}</Text>}
        {shownCommands.map(one => (
          <Button plain key={`c:${one.id}`} onPress={toggle(`c:${one.id}`)}>
            <Text color={KIND_COLOR[one.kind ?? 'other']}>{KIND_MARK[one.kind ?? 'other']}</Text>{' '}
            {fit(one.description || (one.command.split('\n')[0] ?? ''), width - 4 - columnsOf(KIND_MARK[one.kind ?? 'other']))}
            {' '}<Text color={COLOR[one.state]}>{stateMark(one.state)}</Text>
          </Button>
        ))}
      </Box>
    )

    const fileBox = (
      <Box flexDirection="column" width={width}>
        {shownFiles.length === 0 && <Text dimColor>{fileList.length === 0 ? 'ファイルなし' : '該当なし'}</Text>}
        {shownFiles.map(one => (
          <Button plain key={`f:${one.path}`} onPress={toggle(`f:${one.path}`)}>
            <Text color={KIND_COLOR.write}>✎</Text>{' '}
            <Text color="suggestion">{fit(shortPath(one.path), width - 7)}</Text>
            <Text dimColor> ×{one.count}</Text>
          </Button>
        ))}
      </Box>
    )

    // 狭いときはコマンドを先に出す
    return (
      <Box flexDirection="column">
        <Box flexDirection={isWide ? 'row' : 'column'} columnGap={2}>
          <Box width={width}>
            <Text>
              <Text color="claude">流れ </Text>
              {commandList.length === 0 ? <Text dimColor>まだありません</Text> : flow}
            </Text>
          </Box>
          <Box width={width} flexDirection="row" columnGap={2}>{legend}</Box>
        </Box>
        {hasSearch && <Box flexDirection="row" columnGap={2}>
          {/* 幅が足りないときに切れるのが検索欄の説明の側になるよう、並び順を先に置く */}
          <Button plain key="order" onPress={() => update($, order, now => (now === 'new' ? 'old' : 'new'))}>
            <Text dimColor>{sort === 'new' ? '新しい順' : '古い順'}</Text>
          </Button>
          {Input && <Input
            key="query"
            label="検索 "
            placeholder="説明・コマンド・パス"
            value={words}
            submitLabel="絞る"
            onInput={(value: string) => update($, query, () => value)}
            onSubmit={(value: string) => update($, query, () => value)}
          />}
        </Box>}
        <Box flexDirection={isWide ? 'row' : 'column'} columnGap={2}>
          {commandBox}
          {fileBox}
        </Box>
      </Box>
    )
  })
}
