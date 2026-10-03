import type { Grid } from "./grid.js"
import type { DiagramPalette } from "../palette.js"

export interface Point {
  x: number
  y: number
}

/** A single highlight travelling along an ordered list of cells (left→right, top→bottom, or around a box). */
export interface FlowMotion {
  kind: "flow"
  cells: Point[]
  period: number
  offset: number
}

/** A light band sweeping along a solid block run (bars, meters). */
export interface WaveMotion {
  kind: "wave"
  cells: Point[]
  period: number
  offset: number
}

export type Motion = FlowMotion | WaveMotion | GlintMotion

/** A slow blink on isolated markers (commits, points) when nothing else moves. */
export interface GlintMotion {
  kind: "glint"
  cells: Point[]
  period: number
  offset: number
}

const HORIZONTAL = new Set("─━═┄┅╌╍┈┉╴╶╸╺")
const VERTICAL = new Set("│┃║┆┇╎╏╵╷╹╻")
const BARS = new Set("█▓▒░")
const DOTS = new Set("•·")
const GLINTS = new Set("●◉◎◆◇○")
const CORNERS = new Set("╭╮╰╯┌┐└┘╔╗╚╝")
const CORNER_TL = new Set("╭┌╔")
const CORNER_TR = new Set("╮┐╗")
const CORNER_BL = new Set("╰└╚")
const CORNER_BR = new Set("╯┘╝")
const ARROW_R = new Set("►▶→⟶>")
const ARROW_L = new Set("◄◀←⟵<")
const ARROW_D = new Set("▼↓")
const ARROW_U = new Set("▲↑")

const MIN_LINE = 3
const MIN_DOT = 2
const MAX_MOTIONS = 48
const MAX_BOXES = 8

function charAt(grid: Grid, x: number, y: number): string {
  const cell = grid.get(x, y)
  return cell && cell.ch !== "" ? cell.ch : ""
}

function frac(value: number): number {
  return value - Math.floor(value)
}

function phaseFrom(x: number, y: number): number {
  return frac(x * 0.137 + y * 0.291)
}

function pushFlow(motions: Motion[], cells: Point[], axis: "h" | "v", before: string, after: string, x: number, y: number): void {
  if (cells.length < MIN_LINE) return
  // The arrowhead is drawn at the target, so a left/up arrowhead means the
  // connector actually flows right-to-left / bottom-to-top.
  const reverse =
    axis === "h" ? ARROW_L.has(after) || ARROW_L.has(before) : ARROW_U.has(after) || ARROW_U.has(before)
  const ordered = reverse ? [...cells].reverse() : cells
  const length = ordered.length
  motions.push({
    kind: "flow",
    cells: ordered,
    period: Math.max(0.9, Math.min(5, 0.9 + length * 0.14)),
    offset: phaseFrom(x, y),
  })
}

function collectLines(grid: Grid, motions: Motion[]): void {
  // Horizontal runs.
  for (let y = 0; y < grid.h; y += 1) {
    let x = 0
    while (x < grid.w) {
      if (!HORIZONTAL.has(charAt(grid, x, y))) {
        x += 1
        continue
      }
      const start = x
      while (x < grid.w && HORIZONTAL.has(charAt(grid, x, y))) x += 1
      const end = x - 1
      const before = charAt(grid, start - 1, y)
      const after = charAt(grid, end + 1, y)
      if (CORNERS.has(before) && CORNERS.has(after)) continue
      const cells: Point[] = []
      for (let cx = start; cx <= end; cx += 1) cells.push({ x: cx, y })
      pushFlow(motions, cells, "h", before, after, start, y)
    }
  }
  // Vertical runs.
  for (let x = 0; x < grid.w; x += 1) {
    let y = 0
    while (y < grid.h) {
      if (!VERTICAL.has(charAt(grid, x, y))) {
        y += 1
        continue
      }
      const start = y
      while (y < grid.h && VERTICAL.has(charAt(grid, x, y))) y += 1
      const end = y - 1
      const before = charAt(grid, x, start - 1)
      const after = charAt(grid, x, end + 1)
      if (CORNERS.has(before) && CORNERS.has(after)) continue
      const cells: Point[] = []
      for (let cy = start; cy <= end; cy += 1) cells.push({ x, y: cy })
      pushFlow(motions, cells, "v", before, after, x, start)
    }
  }
}

function collectDots(grid: Grid, motions: Motion[]): void {
  for (let y = 0; y < grid.h; y += 1) {
    let x = 0
    while (x < grid.w) {
      if (!DOTS.has(charAt(grid, x, y))) {
        x += 1
        continue
      }
      const start = x
      while (x < grid.w && DOTS.has(charAt(grid, x, y))) x += 1
      const end = x - 1
      if (end - start + 1 < MIN_DOT) continue
      const cells: Point[] = []
      for (let cx = start; cx <= end; cx += 1) cells.push({ x: cx, y })
      motions.push({
        kind: "flow",
        cells,
        period: Math.max(1, Math.min(4, 0.8 + cells.length * 0.2)),
        offset: phaseFrom(start, y),
      })
    }
  }
}

function collectBars(grid: Grid, motions: Motion[]): void {
  const claimed = new Set<number>()
  const claim = (point: Point) => claimed.add(point.y * grid.w + point.x)
  const isClaimed = (x: number, y: number) => claimed.has(y * grid.w + x)

  // Horizontal bars first, so a row of block art wins over accidental columns
  // that only line up because several horizontal bars share the same columns.
  for (let y = 0; y < grid.h; y += 1) {
    let x = 0
    while (x < grid.w) {
      if (!BARS.has(charAt(grid, x, y))) {
        x += 1
        continue
      }
      const start = x
      while (x < grid.w && BARS.has(charAt(grid, x, y))) x += 1
      const end = x - 1
      if (end - start + 1 < MIN_LINE) continue
      const cells: Point[] = []
      for (let cx = start; cx <= end; cx += 1) cells.push({ x: cx, y })
      cells.forEach(claim)
      motions.push({ kind: "wave", cells, period: Math.max(2.2, Math.min(8, 1.6 + cells.length * 0.22)), offset: phaseFrom(start, y) })
    }
  }
  // Vertical bars (e.g. xychart columns) that were not already covered.
  for (let x = 0; x < grid.w; x += 1) {
    let y = 0
    while (y < grid.h) {
      if (!BARS.has(charAt(grid, x, y)) || isClaimed(x, y)) {
        y += 1
        continue
      }
      const start = y
      while (y < grid.h && BARS.has(charAt(grid, x, y)) && !isClaimed(x, y)) y += 1
      const end = y - 1
      if (end - start + 1 < MIN_LINE) continue
      const cells: Point[] = []
      for (let cy = start; cy <= end; cy += 1) cells.push({ x, y: cy })
      cells.forEach(claim)
      motions.push({ kind: "wave", cells, period: Math.max(2.2, Math.min(8, 1.6 + cells.length * 0.22)), offset: phaseFrom(x, start) })
    }
  }
}

function collectBoxes(grid: Grid, motions: Motion[]): void {
  let count = 0
  for (let y = 0; y < grid.h && count < MAX_BOXES; y += 1) {
    for (let x = 0; x < grid.w && count < MAX_BOXES; x += 1) {
      if (!CORNER_TL.has(charAt(grid, x, y))) continue
      let right = x + 1
      while (right < grid.w && HORIZONTAL.has(charAt(grid, right, y))) right += 1
      if (right <= x + 2 || !CORNER_TR.has(charAt(grid, right, y))) continue
      let bottom = y + 1
      while (bottom < grid.h && VERTICAL.has(charAt(grid, x, bottom))) bottom += 1
      if (bottom <= y + 2 || !CORNER_BL.has(charAt(grid, x, bottom))) continue
      if (!CORNER_BR.has(charAt(grid, right, bottom))) continue
      if (right - x > 100 || bottom - y > 60) continue

      const cells: Point[] = []
      for (let cx = x; cx <= right; cx += 1) cells.push({ x: cx, y })
      for (let cy = y + 1; cy <= bottom; cy += 1) cells.push({ x: right, y: cy })
      for (let cx = right - 1; cx >= x; cx -= 1) cells.push({ x: cx, y: bottom })
      for (let cy = bottom - 1; cy > y; cy -= 1) cells.push({ x, y: cy })

      motions.push({
        kind: "flow",
        cells,
        period: Math.max(4, Math.min(12, 4 + cells.length * 0.05)),
        offset: phaseFrom(x, y),
      })
      count += 1
    }
  }
}

/** A slow blink on isolated markers, used for diagrams that have no lines/bars (e.g. gitGraph). */
function collectGlints(grid: Grid, motions: Motion[]): void {
  let count = 0
  for (let y = 0; y < grid.h && count < 24; y += 1) {
    for (let x = 0; x < grid.w && count < 24; x += 1) {
      const ch = charAt(grid, x, y)
      if (!GLINTS.has(ch)) continue
      motions.push({ kind: "glint", cells: [{ x, y }], period: 1.6 + ((x * 7 + y * 3) % 10) * 0.12, offset: phaseFrom(x, y) })
      count += 1
    }
  }
}

/** Derive a set of motion paths by reading the finished diagram grid. */
export function collectMotions(grid: Grid): Motion[] {
  const motions: Motion[] = []
  try {
    collectBars(grid, motions)
    collectDots(grid, motions)
    collectLines(grid, motions)
    collectBoxes(grid, motions)
    // Diagrams whose only graphics are markers (gitGraph, sparse charts) still
    // deserve some life.
    if (motions.length === 0) collectGlints(grid, motions)
  } catch {
    return []
  }
  if (motions.length > MAX_MOTIONS) motions.length = MAX_MOTIONS
  return motions
}

/** Build a single comet that travels the given ordered path from start to end. */
export function makeFlow(cells: Point[], offset = 0): FlowMotion {
  const length = cells.length
  return {
    kind: "flow",
    cells,
    period: Math.max(1.4, Math.min(6, 1.2 + length * 0.045)),
    offset: frac(offset),
  }
}

const COMET = ["●", "•", "·"]
const WAVE = ["▓", "▒", "░"]

/** Draw every motion at time `t` (seconds) onto a clone of the base grid. */
export function applyMotions(grid: Grid, motions: Motion[], t: number, palette: DiagramPalette): void {
  for (const motion of motions) {
    if (motion.kind === "glint") {
      const point = motion.cells[0]
      if (!point) continue
      if (frac(t / motion.period + motion.offset) < 0.3) {
        const base = grid.get(point.x, point.y)
        grid.set(point.x, point.y, base?.ch === "◆" ? "◇" : base?.ch === "◎" ? "○" : "○", palette.accent)
      }
      continue
    }
    const length = motion.cells.length
    if (length < 2) continue
    const phase = frac(t / motion.period + motion.offset)
    const head = Math.min(length - 1, Math.floor(phase * length))

    if (motion.kind === "wave") {
      const radius = length >= 12 ? 1 : 0
      for (let d = -radius; d <= radius; d += 1) {
        const index = head + d
        if (index < 0 || index >= length) continue
        const point = motion.cells[index]
        if (!point) continue
        const base = grid.get(point.x, point.y)
        grid.set(point.x, point.y, d === 0 ? WAVE[0] : WAVE[1], base?.fg ?? palette.accent)
      }
      continue
    }

    for (let k = 0; k < COMET.length; k += 1) {
      const index = head - k
      if (index < 0) break
      const point = motion.cells[index]
      if (!point) continue
      const color = k === 0 ? palette.accent : k === 1 ? palette.accent2 : palette.dim
      grid.set(point.x, point.y, COMET[k], color)
    }
  }
}
