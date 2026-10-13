// 一覧の絞り込みと並び順。描画から切り離してテストできるようにする
import type { CommandEntry, FileEntry, Filter, Order } from '../types'

// 大文字小文字を区別せず、どれか1つに部分一致すれば残す
const matches = (query: string, texts: string[]) => {
  const q = query.trim().toLowerCase()
  return q === '' || texts.some(text => text.toLowerCase().includes(q))
}

export const pickCommands = (list: CommandEntry[], filter: Filter, query: string) =>
  list.filter(one =>
    (filter === '' || (filter === 'failed' ? one.state === 'failed' : (one.kind ?? 'other') === filter)) &&
    matches(query, [one.description, one.command]),
  )

export const pickFiles = (list: FileEntry[], query: string) => list.filter(one => matches(query, [one.path]))

// 収まる件数だけ最新から取り、新しい順なら最新を上にする
export const latest = <T,>(list: T[], room: number, order: Order) =>
  order === 'new' ? list.slice(-room).reverse() : list.slice(-room)
