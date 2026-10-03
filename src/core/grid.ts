import { StyledText, type RGBA, type TextChunk } from "@opentui/core"
import type { Canvas } from "./canvas.js"
import { graphemes, textWidth } from "./text.js"
import { colorFor, type DiagramPalette } from "../palette.js"

export interface GridCell {
  ch: string
  fg?: RGBA
  bg?: RGBA
  attributes?: number
}

/**
 * A character grid with per-cell colors. Both render paths converge here:
 * the custom families produce a `Canvas` (semantic styles), the vendored engine
 * produces a `StyledText` (already-resolved colors). The motion engine only
 * needs this shape, so animation works for every diagram type.
 */
export class Grid {
  readonly w: number
  readonly h: number
  private readonly cells: GridCell[]

  constructor(width: number, height: number) {
    this.w = Math.max(0, Math.floor(width))
    this.h = Math.max(0, Math.floor(height))
    this.cells = Array.from({ length: this.w * this.h }, () => ({ ch: " " }))
  }

  private index(x: number, y: number): number {
    return y * this.w + x
  }

  get(x: number, y: number): GridCell | undefined {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return undefined
    return this.cells[this.index(x, y)]
  }

  set(x: number, y: number, ch: string, fg?: RGBA, bg?: RGBA, attributes?: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.cells[this.index(x, y)] = { ch, fg, bg, attributes }
  }

  clone(): Grid {
    const copy = new Grid(this.w, this.h)
    for (let index = 0; index < this.cells.length; index += 1) {
      const cell = this.cells[index]
      copy.cells[index] = { ...cell }
    }
    return copy
  }

  /** Last column (exclusive) that holds a visible, non-space glyph. */
  rowEnd(y: number): number {
    for (let x = this.w - 1; x >= 0; x -= 1) {
      const cell = this.get(x, y)
      if (cell && cell.ch !== "" && cell.ch.trim() !== "") return x + 1
    }
    return 0
  }

  widthUsed(): number {
    let max = 0
    for (let y = 0; y < this.h; y += 1) max = Math.max(max, this.rowEnd(y))
    return max
  }

  heightUsed(): number {
    let max = 0
    for (let y = 0; y < this.h; y += 1) {
      if (this.rowEnd(y) > 0) max = y + 1
    }
    return max
  }

  toStyledText(): StyledText {
    const chunks: TextChunk[] = []
    const height = Math.max(1, this.heightUsed())
    for (let y = 0; y < height; y += 1) {
      const end = this.rowEnd(y)
      let run = ""
      let fg: RGBA | undefined
      let bg: RGBA | undefined
      let attributes: number | undefined
      const flush = () => {
        if (run.length === 0) return
        chunks.push({ __isChunk: true, text: run, fg, bg, attributes } as TextChunk)
        run = ""
      }
      for (let x = 0; x < end; x += 1) {
        const cell = this.get(x, y)
        if (!cell || cell.ch === "") continue
        if (cell.fg !== fg || cell.bg !== bg || cell.attributes !== attributes) {
          flush()
          fg = cell.fg
          bg = cell.bg
          attributes = cell.attributes
        }
        run += cell.ch
      }
      flush()
      if (y < height - 1) chunks.push({ __isChunk: true, text: "\n" } as TextChunk)
    }
    if (chunks.length === 0) chunks.push({ __isChunk: true, text: " " } as TextChunk)
    return new StyledText(chunks)
  }

  static fromCanvas(canvas: Canvas, palette: DiagramPalette): Grid {
    const grid = new Grid(canvas.w, canvas.h)
    for (let y = 0; y < canvas.h; y += 1) {
      for (let x = 0; x < canvas.w; x += 1) {
        const cell = canvas.get(x, y)
        if (!cell || cell.ch === "") continue
        grid.set(x, y, cell.ch, colorFor(palette, cell.style))
      }
    }
    return grid
  }

  static fromStyledText(styled: StyledText): Grid {
    const rows: GridCell[][] = []
    let row: GridCell[] = []
    let x = 0
    const newline = () => {
      rows.push(row)
      row = []
      x = 0
    }
    const source = Array.isArray(styled?.chunks) ? styled.chunks : []
    for (const chunk of source) {
      if (!chunk || typeof chunk.text !== "string") continue
      const fg = (chunk as TextChunk).fg
      const bg = (chunk as TextChunk).bg
      const attributes = (chunk as TextChunk).attributes
      const parts = chunk.text.split("\n")
      for (let index = 0; index < parts.length; index += 1) {
        if (index > 0) newline()
        for (const glyph of graphemes(parts[index])) {
          const width = textWidth(glyph)
          if (width <= 0) continue
          row[x] = { ch: glyph, fg, bg, attributes }
          for (let k = 1; k < width; k += 1) row[x + k] = { ch: "", fg, bg, attributes }
          x += width
        }
      }
    }
    rows.push(row)

    const height = Math.max(1, rows.length)
    let width = 1
    for (const entry of rows) width = Math.max(width, entry.length)
    const grid = new Grid(width, height)
    for (let y = 0; y < height; y += 1) {
      const entry = rows[y] ?? []
      for (let cx = 0; cx < entry.length; cx += 1) {
        const cell = entry[cx]
        if (cell) grid.cells[y * width + cx] = cell
      }
    }
    return grid
  }
}
