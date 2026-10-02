import { unquote } from "../core/text.js"

export function sourceLines(source: string): string[] {
  return source.replace(/\r\n?/g, "\n").split("\n")
}

export function firstMeaningfulLine(source: string): string {
  for (const raw of sourceLines(source)) {
    const line = raw.trim()
    if (line && !line.startsWith("%%")) return line
  }
  return ""
}

export function decodeLabel(value: string): string {
  const decoded = value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  return unquote(decoded).replace(/\s+/g, " ").trim()
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function repeat(ch: string, count: number): string {
  return count > 0 ? ch.repeat(count) : ""
}
