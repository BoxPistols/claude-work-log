// 端末での表示幅を数える。全角は2列、それ以外は1列
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3FFFD}]/u

export const columnsOf = (text: string) => [...text].reduce((sum, ch) => sum + (WIDE.test(ch) ? 2 : 1), 0)

// 幅に収まらない文字列は末尾を…で切る。文字数ではなく表示幅で数える
export const fit = (text: string, width: number) => {
  if (columnsOf(text) <= width) return text
  let out = ''
  let used = 0
  for (const ch of text) {
    const w = WIDE.test(ch) ? 2 : 1
    if (used + w > width - 1) break
    out += ch
    used += w
  }
  return `${out}…`
}
