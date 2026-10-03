import { RGBA } from "@opentui/core"
import type { DiagramPalette } from "../palette.js"
import type { Grid } from "./grid.js"

export interface Point {
  x: number
  y: number
}

export interface FlowMotion {
  kind: "flow"
  /** Ordered source-to-target route cells. */
  cells: Point[]
  /** Time spent travelling the route, before pausing at the destination. */
  travelDuration: number
  /** Full travel + pause cycle duration. */
  period: number
  destinationPause: number
  /** Delay before the first journey starts; unlike phase offsets, this keeps the dot at the source. */
  delay: number
  tone: "accent" | "accent2" | "info"
  highlights: NodeHighlight[]
}

export interface NodeHighlightCell extends Point {
  kind: "fill" | "ink"
}

export interface NodeHighlight {
  cells: NodeHighlightCell[]
  start: number
  end: number
}

export type Motion = FlowMotion

export interface MotionMarker extends Point {
  tone: FlowMotion["tone"]
  kind: "dot" | "arrowhead"
}

export interface MotionFrame {
  key: string
  markers: MotionMarker[]
  highlights: NodeHighlightCell[]
}

export interface FlowTiming {
  cellsPerSecond?: number
  minimumDuration?: number
  destinationPause?: number
}

const FLOW_CELLS_PER_SECOND = 6
const MINIMUM_TRAVEL_SECONDS = 0.24
const DESTINATION_PAUSE_SECONDS = 0.8
const FLOW_TRACK_GLYPHS = new Set("─━═│┃║┆┇╎╏┄┅┈┉╌╍╴╶╸╺╭╮╰╯┌┐└┘├┤┬┴┼┏┓┗┛┣┫┳┻╋╔╗╚╝╠╣╦╩╬")
const FLOW_ARROW_GLYPHS = new Set("►◄▼▲▶◀→←↓↑⟶⟵")

export function isFlowTrackGlyph(char: string): boolean {
  return FLOW_TRACK_GLYPHS.has(char)
}

export function isFlowArrowGlyph(char: string): boolean {
  return FLOW_ARROW_GLYPHS.has(char)
}

/** Create a steady one-way flow. Timing is based on route length, not a capped loop. */
export function makeFlow(
  cells: Point[],
  delay = 0,
  tone: FlowMotion["tone"] = "accent",
  timing: FlowTiming = {},
): FlowMotion {
  const destinationPause = timing.destinationPause ?? DESTINATION_PAUSE_SECONDS
  const travelDuration = Math.max(
    timing.minimumDuration ?? MINIMUM_TRAVEL_SECONDS,
    (cells.length - 1) / (timing.cellsPerSecond ?? FLOW_CELLS_PER_SECOND),
  )
  return {
    kind: "flow",
    cells,
    travelDuration,
    period: travelDuration + destinationPause,
    destinationPause,
    delay: Math.max(0, delay),
    tone,
    highlights: [],
  }
}

/**
 * Draw only the semantic flow marker. Text, arrowheads and boxes are never
 * overwritten—even when a routed path crosses an edge label.
 *
 * Returns the rendered marker set so the shared animation loop can skip an
 * unchanged frame instead of asking OpenTUI to paint the same cells again.
 */
export function resolveMotionFrame(base: Grid, motions: readonly Motion[], seconds: number): MotionFrame {
  const rendered = new Map<number, MotionMarker>()
  const highlighted = new Map<number, NodeHighlightCell>()

  for (const motion of motions) {
    const length = motion.cells.length
    if (length < 2 || motion.travelDuration <= 0 || motion.period <= 0) continue

    const elapsed = seconds - motion.delay
    if (elapsed < 0) continue
    const cycleTime = elapsed % motion.period

    if (cycleTime <= motion.travelDuration) {
      const progress = Math.min(1, cycleTime / motion.travelDuration)
      const index = Math.min(length - 1, Math.round(progress * (length - 1)))
      const point = motion.cells[index]
      if (point) {
        const baseCell = base.get(point.x, point.y)
        if (baseCell && (isFlowTrackGlyph(baseCell.ch) || isFlowArrowGlyph(baseCell.ch))) {
          const cellKey = point.y * base.w + point.x
          if (!rendered.has(cellKey)) {
            rendered.set(cellKey, {
              ...point,
              tone: motion.tone,
              kind: isFlowArrowGlyph(baseCell.ch) ? "arrowhead" : "dot",
            })
          }
        }
      }
    }

    for (const effect of motion.highlights) {
      if (cycleTime < effect.start || cycleTime >= effect.end) continue
      for (const cell of effect.cells) {
        const cellKey = cell.y * base.w + cell.x
        const current = highlighted.get(cellKey)
        if (!current || (current.kind === "fill" && cell.kind === "ink")) highlighted.set(cellKey, cell)
      }
    }
  }

  const markers = [...rendered.entries()].sort(([left], [right]) => left - right).map(([, marker]) => marker)
  const highlights = [...highlighted.entries()].sort(([left], [right]) => left - right).map(([, cell]) => cell)
  const markerKey = markers
    .map((marker) => `${marker.y * base.w + marker.x}:${marker.tone}:${marker.kind}`)
    .join(";")
  const highlightKey = highlights.map((cell) => `${cell.y * base.w + cell.x}:${cell.kind}`).join(";")
  const key = markerKey || highlightKey ? `m:${markerKey}|h:${highlightKey}` : ""
  return { key, markers, highlights }
}

export function applyMotionFrame(
  grid: Grid,
  markers: readonly MotionMarker[],
  palette: DiagramPalette,
  highlights: readonly NodeHighlightCell[] = [],
): void {
  const bg =
    palette.activeBg ??
    RGBA.fromInts(
      Math.round(palette.accent.r * 0.22),
      Math.round(palette.accent.g * 0.22),
      Math.round(palette.accent.b * 0.22),
      255,
    )
  for (const highlight of highlights) {
    const cell = grid.get(highlight.x, highlight.y)
    if (!cell) continue
    grid.set(
      highlight.x,
      highlight.y,
      cell.ch,
      highlight.kind === "ink" ? palette.accent : cell.fg,
      bg,
      cell.attributes,
    )
  }
  for (const marker of markers) {
    const cell = grid.get(marker.x, marker.y)
    grid.set(
      marker.x,
      marker.y,
      marker.kind === "dot" ? "●" : (cell?.ch ?? "●"),
      palette[marker.tone],
      cell?.bg,
      cell?.attributes,
    )
  }
}

export function applyMotions(grid: Grid, motions: readonly Motion[], seconds: number, palette: DiagramPalette): string {
  const frame = resolveMotionFrame(grid, motions, seconds)
  applyMotionFrame(grid, frame.markers, palette, frame.highlights)
  return frame.key
}
