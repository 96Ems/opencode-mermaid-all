import { TextRenderable, type MarkdownCodeBlockRenderer, type RenderContext } from "@opentui/core"
import { animateGrid, readAnimationOptions } from "./animation.js"
import { Grid } from "./core/grid.js"
import type { Motion } from "./core/motion.js"
import { createMermaidCodeBlockRenderer } from "../vendor/merman/markdown.js"
import { detectMermaidDiagram } from "../vendor/merman/detect.js"
import { findFamily } from "./families/index.js"
import { flowchartRouteMotions, sankeyRouteMotions, sequenceRouteMotions } from "./motion-design.js"
import { resolvePalette, type DiagramPalette } from "./palette.js"
import { DiagramRenderable } from "./renderable.js"
import { parseMermaidGitGraphDiagram } from "../vendor/merman/gitgraph/parser.js"
import { drawGitGraphDiagramGrid } from "../vendor/merman/gitgraph/drawing.js"
import { renderDiagramGridStyledTextByStyle } from "../vendor/merman/core/render-grid.js"

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
 * The vendored engine returns a ready `TextRenderable` for the six native
 * families. Rather than replace it (and lose its layout, style and scroll
 * behaviour), we read its styled content back into a grid and animate that
 * renderable in place.
 */
function animateVendored(renderable: unknown, palette: DiagramPalette, motions: readonly Motion[]): void {
  if (!(renderable instanceof TextRenderable)) return
  try {
    const grid = Grid.fromStyledText(renderable.content)
    animateGrid(renderable, grid, palette, motions, readAnimationOptions())
  } catch {
    // Keep the static rendering if anything about the content is unexpected.
  }
}

/**
 * Render a gitGraph diagram with per-branch colors from our palette.
 * The vendored engine renders all branches in the same muted color; we override
 * branch0..branch7 with distinct accent colors.
 */
function renderGitGraphWithBranchColors(
  source: string,
  palette: DiagramPalette,
  ctx: RenderContext,
): TextRenderable | undefined {
  try {
    const diagram = parseMermaidGitGraphDiagram(source)
    const grid = drawGitGraphDiagramGrid(diagram)

    // Build foreground colors for each branch style.
    // Use categorical palette colors if available, otherwise fall back to
    // accent/accent2/warn/ok/info.
    const branchColors = [
      palette.accent,
      palette.accent2,
      palette.warn,
      palette.ok,
      palette.info,
      palette.text,
      palette.muted,
      palette.dim,
    ]

    const foregrounds: Record<string, TextRenderable["content"]["chunks"][0]["fg"]> = {
      commit: palette.accent,
      merge: palette.accent2,
      highlight: palette.warn,
      reverse: palette.info,
      label: palette.text,
    }
    for (let i = 0; i < 8; i += 1) {
      foregrounds[`branch${i}`] = branchColors[i % branchColors.length]
    }

    const styledText = renderDiagramGridStyledTextByStyle(grid, foregrounds, undefined, {
      trimBottom: true,
    })

    return new TextRenderable(ctx, { content: styledText })
  } catch {
    return undefined
  }
}

/**
 * Build the `mermaid` code-block renderer: the vendored OpenCode engine handles
 * flowchart/sequence/state/gantt/timeline, and the extra families here
 * handle everything else (including gitGraph with custom branch colors).
 * Returning `undefined` falls back to the source block.
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
    // Handle gitGraph ourselves to give each branch its own color.
    const kind = detectMermaidDiagram(token.text)
    if (kind === "gitGraph") {
      const palette = resolvePalette(source().theme, source().mode)
      const handled = renderGitGraphWithBranchColors(token.text, palette, ctx)
      if (handled) return handled
      // Fall through to vendored if our rendering fails.
    }

    const handled = vendored(token, tokenContext)
    if (handled) {
      try {
        const palette = resolvePalette(source().theme, source().mode)
        const kind = detectMermaidDiagram(token.text)
        const motions =
          kind === "flowchart"
            ? flowchartRouteMotions(token.text, ctx.width)
            : kind === "sequence"
              ? sequenceRouteMotions(token.text)
              : []
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
      const motions = family.name === "sankey" ? sankeyRouteMotions(token.text, canvas) : []
      return new DiagramRenderable(ctx, grid, palette, motions)
    } catch {
      return undefined
    }
  }
}
