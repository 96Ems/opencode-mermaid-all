import stringWidth from "string-width"

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

export function textWidth(value: string): number {
  return stringWidth(value)
}

export function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), (part) => part.segment)
}

export function padEnd(value: string, target: number): string {
  const current = textWidth(value)
  if (current >= target) return value
  return value + " ".repeat(target - current)
}

export function truncate(value: string, target: number, ellipsis = "\u2026"): string {
  if (target <= 0) return ""
  if (textWidth(value) <= target) return value
  const ell = textWidth(ellipsis)
  let out = ""
  let used = 0
  for (const grapheme of graphemes(value)) {
    const gw = textWidth(grapheme)
    if (used + gw > target - ell) break
    out += grapheme
    used += gw
  }
  return out + ellipsis
}

export function wrapText(value: string, target: number): string[] {
  if (target <= 0) return [value]
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length === 0) return [""]
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (textWidth(candidate) <= target) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    let rest = word
    while (textWidth(rest) > target) {
      let chunk = ""
      let used = 0
      for (const grapheme of graphemes(rest)) {
        const gw = textWidth(grapheme)
        if (used + gw > target) break
        chunk += grapheme
        used += gw
      }
      if (!chunk) break
      lines.push(chunk)
      rest = rest.slice(chunk.length)
    }
    line = rest
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : [""]
}

export function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}
