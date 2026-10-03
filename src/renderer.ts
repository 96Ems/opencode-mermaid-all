import { TextRenderable, type MarkdownCodeBlockRenderer, type RenderContext } from "@opentui/core"
import { animateGrid, readAnimationOptions } from "./animation.js"
import { Grid } from "./core/grid.js"
import { makeFlow, type Motion, type Point } from "./core/motion.js"
import { createMermaidCodeBlockRenderer } from "../vendor/merman/markdown.js"
import { detectMermaidDiagram } from "../vendor/merman/detect.js"
import { drawFlowchartDiagramGrid } from "../vendor/merman/flowchart/drawing.js"
import { layoutFlowchartDiagram } from "../vendor/merman/flowchart/layout.js"
import { parseMermaidFlowchartDiagram } from "../vendor/merman/flowchart/parser.js"
import { walkOrthogonalSegment } from "../vendor/merman/core/geometry.js"
import { findFamily } from "./families/index.js"
import { resolvePalette, type DiagramPalette } from "./palette.js"
import { DiagramRenderable } from "./renderable.js"

export interface ThemeSource {
  theme: unknown
  mode: "dark" | "light"
}

/**
 * Build the vendored engine's color map from our own defensive palette.
 * We deliberately do NOT call the vendored `resolveOpenCodeDiagramPalette`:
 * it reads a resolved-theme shape that the public plugin `context.theme` does
 * not provide, and it throws (`input.text.r` on undefined) instead of falling
 * back. Missing keys are fine here — the vendored renderers fall back to their
 * own default RGB palette.
 */
function vendoredColors(palette: DiagramPalette): Record<string, unknown> {
  return {
    text: palette.text,
    primary: palette.text,
    secondary: palette.muted,
    muted: palette.muted,
    warning: palette.warn,
    info: palette.info,
    request: palette.ok,
    response: palette.warn,
    note: palette.text,
    noteBorder: palette.accent,
    noteText: palette.text,
    noteConnector: palette.muted,
    boxText: palette.text,
    boxBorder: palette.border,
    line: palette.muted,
    group: palette.accent,
    groupText: palette.accent,
    marker: palette.muted,
    start: palette.muted,
    end: palette.warn,
    choice: palette.accent2,
  }
}

/**
 * Flowcharts get one comet per edge, travelling the edge's real routed
 * polyline from source to target. Animating each straight segment separately
 * looked like a ball bouncing left-right on every bar, which is exactly what
 * we want to avoid.
 */
export function flowchartRouteMotions(source: string, ctxWidth: number): Motion[] | undefined {
  try {
    const layoutMaxWidth = Math.min(120, Math.max(1, Math.floor(ctxWidth)))
    const options = { compact: true, layoutMaxWidth }
    const grid = drawFlowchartDiagramGrid(parseMermaidFlowchartDiagram(source), options)
    let trimTop = 0
    for (let y = 0; y < grid.height; y += 1) {
      let any = false
      for (let x = 0; x < grid.width; x += 1) {
        const cell = grid.getCell(x, y)
        if (cell && cell.char.trim() !== "") {
          any = true
          break
        }
      }
      if (any) break
      trimTop += 1
    }

    const layout = layoutFlowchartDiagram(parseMermaidFlowchartDiagram(source), options)
    const motions: Motion[] = []
    layout.routes.forEach((route, index) => {
      const points = route.points
      if (!points || points.length < 2) return
      const cells: Point[] = []
      for (let i = 1; i < points.length; i += 1) {
        walkOrthogonalSegment(points[i - 1]!, points[i]!, i === 1, (point) => {
          cells.push({ x: point.x, y: point.y - trimTop })
        })
      }
      const path: Point[] = []
      for (const cell of cells) {
        const last = path[path.length - 1]
        if (!last || last.x !== cell.x || last.y !== cell.y) path.push(cell)
      }
      if (path.length < 2) return
      if (route.edge.sourceArrowhead) path.reverse()
      const seed = index * 0.19 + (points[0]?.x ?? 0) * 0.011 + (points[0]?.y ?? 0) * 0.017
      motions.push(makeFlow(path, seed))
    })
    return motions.length > 0 ? motions : undefined
  } catch {
    return undefined
  }
}

/**
 * The vendored engine returns a ready `TextRenderable` for the six native
 * families. Rather than replace it (and lose its layout, style and scroll
 * behaviour), we read its styled content back into a grid and animate that
 * renderable in place.
 */
function animateVendored(renderable: unknown, palette: DiagramPalette, motions?: Motion[]): void {
  if (!(renderable instanceof TextRenderable)) return
  try {
    const grid = Grid.fromStyledText(renderable.content)
    animateGrid(renderable, grid, palette, readAnimationOptions(), motions)
  } catch {
    // Keep the static rendering if anything about the content is unexpected.
  }
}

/**
 * Build the `mermaid` code-block renderer: the vendored OpenCode engine handles
 * flowchart/sequence/state/gantt/gitGraph/timeline, and the extra families here
 * handle everything else. Returning `undefined` falls back to the source block.
 */
export function createMermaidAllRenderer(
  ctx: RenderContext,
  source: () => ThemeSource,
): MarkdownCodeBlockRenderer {
  const vendored = createMermaidCodeBlockRenderer(ctx, () => {
    try {
      return { colors: vendoredColors(resolvePalette(source().theme, source().mode)) as never }
    } catch {
      return {}
    }
  })

  return (token, tokenContext) => {
    const handled = vendored(token, tokenContext)
    if (handled) {
      try {
        const palette = resolvePalette(source().theme, source().mode)
        const motions =
          detectMermaidDiagram(token.text) === "flowchart"
            ? flowchartRouteMotions(token.text, ctx.width)
            : undefined
        animateVendored(handled, palette, motions)
      } catch {
        // Never let animation break the diagram itself.
      }
      return handled
    }

    const family = findFamily(token.text)
    if (!family) return undefined

    const maxWidth = Math.max(24, Math.min(140, Math.floor(ctx.width)))
    try {
      const canvas = family.render(token.text, { width: maxWidth })
      if (canvas.heightUsed() === 0) return undefined
      const palette = resolvePalette(source().theme, source().mode)
      const grid = Grid.fromCanvas(canvas, palette)
      return new DiagramRenderable(ctx, grid, palette)
    } catch {
      return undefined
    }
  }
}
