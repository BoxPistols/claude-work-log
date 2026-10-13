// コマンドの中身から作業の種類を決める。色分けの元になる
export type Kind = 'check' | 'git' | 'write' | 'read' | 'other'

export const KIND_LABEL: Record<Kind, string> = {
  read: '調べる',
  write: '書き換え',
  check: '検証',
  git: 'git',
  other: 'その他',
}
export const KIND_COLOR: Record<Kind, string> = {
  read: 'suggestion',
  write: 'warning',
  check: 'merged',
  git: 'success',
  other: 'inactive',
}
// 色だけに頼らず形でも見分けられるよう、種類ごとに記号を変える
export const KIND_MARK: Record<Kind, string> = {
  read: '●',
  write: '✎',
  check: '▲',
  git: '⑂',
  other: '・',
}
// 凡例に並べる順
export const KIND_ORDER: Kind[] = ['read', 'write', 'check', 'git', 'other']

const CHECK = /(^|[\s;&|(])(npm (run )?test|pnpm (run )?test|yarn test|vitest|jest|tsc|eslint|validate|plugin test|pytest|shellcheck|lint)\b/
const GIT = /(^|[\s;&|(])(git|gh)\s/
const WRITE = /(^|[\s;&|(])(sed -i|cp|mv|mkdir|rm|touch|tee|chmod|ln|python3? -|cat\s*>)\s|[^>]>\s*(?!\/dev\/null\b)[^&\s]/
const READ = /(^|[\s;&|(])(ls|grep|rg|find|cat|head|tail|sed -n|wc|awk|less|tree|stat|which|file)\b/

export const classify = (command: string): Kind =>
  CHECK.test(command) ? 'check'
  : GIT.test(command) ? 'git'
  : WRITE.test(command) ? 'write'
  : READ.test(command) ? 'read'
  : 'other'
