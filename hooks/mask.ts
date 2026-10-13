// 秘密の値に見える文字列を伏せ字にする。記録と表示の前に必ず通す
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\b(sk-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g,
  /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
]
// 名前に秘密らしい語を含む代入・指定の値
const NAMED = /\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PASS|API_?KEY|PRIVATE_?KEY|CREDENTIAL)[A-Za-z0-9_]*)(\s*[=:]\s*|\s+)("[^"]*"|'[^']*'|[^\s"']+)/gi
const BEARER = /\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const URL_USERINFO = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi
const FLAG = /(--?(?:password|passwd|token|secret|api-key|apikey)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi

export const MASK = '•••'

export const mask = (text: string): string => {
  let out = text
  for (const pattern of PATTERNS) out = out.replace(pattern, MASK)
  out = out.replace(URL_USERINFO, `$1${MASK}@`)
  out = out.replace(BEARER, (_m, kind: string) => `${kind} ${MASK}`)
  out = out.replace(FLAG, (_m, flag: string) => `${flag}${MASK}`)
  out = out.replace(NAMED, (_m, name: string, sep: string) => `${name}${sep}${MASK}`)
  return out
}
