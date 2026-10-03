import { TextRenderable, type RenderContext } from "@opentui/core"
import { animateGrid } from "./animation.js"
import { Grid } from "./core/grid.js"
import type { Motion } from "./core/motion.js"
import type { DiagramPalette } from "./palette.js"

/** Horizontal-scrollable diagram block, mirroring the built-in renderer. */
export class DiagramRenderable extends TextRenderable {
  constructor(ctx: RenderContext, grid: Grid, palette: DiagramPalette, motions: readonly Motion[] = []) {
    super(ctx, {
      content: grid.toStyledText(),
      width: "100%",
      height: Math.max(1, grid.heightUsed()),
      wrapMode: "none",
      selectable: false,
      marginTop: 1,
    })
    let dragX: number | undefined
    this.onMouseDown = (event) => {
      if (event.button !== 0) return
      ctx.clearSelection()
      dragX = event.x
      event.preventDefault()
      event.stopPropagation()
    }
    this.onMouseDrag = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (dragX === undefined) return
      const dx = event.x - dragX
      dragX = event.x
      if (dx) this.scrollX -= dx
    }
    this.onMouseDragEnd = (event) => {
      dragX = undefined
      event.preventDefault()
      event.stopPropagation()
    }
    this.onMouseUp = (event) => {
      if (event.button !== 0) return
      dragX = undefined
      event.preventDefault()
      event.stopPropagation()
    }
    this.onMouseScroll = (event) => {
      const scroll = event.scroll
      if (!scroll || (scroll.direction !== "left" && scroll.direction !== "right")) return
      event.preventDefault()
      event.stopPropagation()
    }
    animateGrid(this, grid, palette, motions)
  }
}
