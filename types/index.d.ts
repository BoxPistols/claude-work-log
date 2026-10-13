// 変更したファイル1件
export type FileEntry = { path: string; tool: string; count: number }
// 実行したコマンド1件。説明と結果の先頭は詳細の表示に使う
export type CommandEntry = {
  id: string
  command: string
  description: string
  output: string
  kind: 'check' | 'git' | 'write' | 'read' | 'other'
  state: 'runs' | 'ok' | 'failed'
}

// 一覧の絞り込み。空文字は全件、'failed'は失敗した行だけ
export type Filter = '' | CommandEntry['kind'] | 'failed'
// 一覧の並び。'new'は最新を上に出す
export type Order = 'new' | 'old'

declare module 'claude-code' {
  interface PluginState {
    // selectedは詳細を開いている行。'c:<id>'か'f:<path>'、閉じているときは空文字
    // filter・query・orderは一覧の絞り込み、検索語、並び順
    'work-log': {
      files: FileEntry[]
      commands: CommandEntry[]
      selected: string
      filter: Filter
      query: string
      order: Order
    }
  }
}
