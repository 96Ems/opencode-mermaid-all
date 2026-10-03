import { TextRenderable, type MarkdownCodeBlockRenderer, type RenderContext } from "@opentui/core"
import { animateGrid, readAnimationOptions } from "./animation.js"
import { Grid } from "./core/grid.js"
import { createMermaidCodeBlockRenderer } from "../vendor/merman/markdown.js"
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
 * The vendored engine returns a ready `TextRenderable` for the six native
 * families. Rather than replace it (and lose its layout, style and scroll
 * behaviour), we read its styled content back into a grid and animate that
 * renderable in place.
 */
function animateVendored(renderable: unknown, palette: DiagramPalette): void {
  if (!(renderable instanceof TextRenderable)) return
  try {
    const grid = Grid.fromStyledText(renderable.content)
    animateGrid(renderable, grid, palette, readAnimationOptions())
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
        animateVendored(handled, resolvePalette(source().theme, source().mode))
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
