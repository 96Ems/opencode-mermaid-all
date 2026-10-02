import { graphemes, textWidth } from "./text.js"

export type StyleName =
  | "text"
  | "muted"
  | "border"
  | "accent"
  | "accent2"
  | "warn"
  | "ok"
  | "info"
  | "dim"

export interface Cell {
  ch: string
  style?: StyleName
}

export interface BoxOptions {
  style?: StyleName
  round?: boolean
  title?: string
  titleStyle?: StyleName
}

/**
 * A tiny character grid. Families draw into it using semantic style names; the
 * renderable maps those names to theme colors at the OpenTUI boundary.
 */
export class Canvas {
  readonly w: number
  readonly h: number
  private readonly cells: Cell[]

  constructor(width: number, height: number) {
    this.w = Math.max(0, Math.floor(width))
    this.h = Math.max(0, Math.floor(height))
    this.cells = Array.from({ length: this.w * this.h }, () => ({ ch: " " }))
  }

  private index(x: number, y: number): number {
    return y * this.w + x
  }

  set(x: number, y: number, ch: string, style?: StyleName): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.cells[this.index(x, y)] = style ? { ch, style } : { ch }
  }

  get(x: number, y: number): Cell | undefined {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return undefined
    return this.cells[this.index(x, y)]
  }

  /** Write a string starting at (x, y); returns the column after the last glyph. */
  text(x: number, y: number, value: string, style?: StyleName): number {
    let cursor = x
    for (const grapheme of graphemes(value)) {
      const gw = textWidth(grapheme)
      if (gw <= 0) continue
      this.set(cursor, y, grapheme === "" ? " " : grapheme, style)
      for (let k = 1; k < gw; k += 1) this.set(cursor + k, y, "")
      cursor += gw
    }
    return cursor
  }

  fill(x: number, y: number, width: number, height: number, ch: string, style?: StyleName): void {
    for (let j = 0; j < height; j += 1) {
      for (let i = 0; i < width; i += 1) this.set(x + i, y + j, ch, style)
    }
  }

  hline(x: number, y: number, length: number, ch = "\u2500", style?: StyleName): void {
    for (let i = 0; i < length; i += 1) this.set(x + i, y, ch, style)
  }

  vline(x: number, y: number, length: number, ch = "\u2502", style?: StyleName): void {
    for (let j = 0; j < length; j += 1) this.set(x, y + j, ch, style)
  }

  box(x: number, y: number, width: number, height: number, options: BoxOptions = {}): void {
    if (width < 2 || height < 1) return
    const style = options.style ?? "border"
    const round = options.round ?? false
    const topLeft = round ? "\u256d" : "\u250c"
    const topRight = round ? "\u256e" : "\u2510"
    const bottomLeft = round ? "\u2570" : "\u2514"
    const bottomRight = round ? "\u256f" : "\u2518"
    if (height >= 2) {
      this.hline(x + 1, y, width - 2, "\u2500", style)
      this.hline(x + 1, y + height - 1, width - 2, "\u2500", style)
      this.vline(x, y + 1, height - 2, "\u2502", style)
      this.vline(x + width - 1, y + 1, height - 2, "\u2502", style)
    } else {
      this.hline(x, y, width, "\u2500", style)
    }
    this.set(x, y, topLeft, style)
    this.set(x + width - 1, y, topRight, style)
    this.set(x, y + height - 1, bottomLeft, style)
    this.set(x + width - 1, y + height - 1, bottomRight, style)
    if (options.title) this.text(x + 2, y, ` ${options.title} `, options.titleStyle ?? "text")
  }

  widthUsed(): number {
    let max = 0
    for (let y = 0; y < this.h; y += 1) {
      for (let x = this.w - 1; x >= 0; x -= 1) {
        const cell = this.get(x, y)
        if (cell && cell.ch.trim() !== "") {
          max = Math.max(max, x + 1)
          break
        }
      }
    }
    return max
  }

  heightUsed(): number {
    let max = 0
    for (let y = 0; y < this.h; y += 1) {
      let any = false
      for (let x = 0; x < this.w; x += 1) {
        const cell = this.get(x, y)
        if (cell && cell.ch.trim() !== "") {
          any = true
          break
        }
      }
      if (any) max = y + 1
    }
    return max
  }

  toPlain(): string {
    const lines: string[] = []
    for (let y = 0; y < this.h; y += 1) {
      let line = ""
      for (let x = 0; x < this.w; x += 1) {
        const cell = this.get(x, y)
        line += cell ? cell.ch : " "
      }
      lines.push(line.replace(/\s+$/, ""))
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
    return lines.join("\n")
  }
}
