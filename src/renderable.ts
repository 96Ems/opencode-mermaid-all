import { StyledText, TextRenderable, type RenderContext, type TextChunk } from "@opentui/core"
import type { Canvas, StyleName } from "./core/canvas.js"
import { colorFor, type DiagramPalette } from "./palette.js"

export function canvasToStyledText(canvas: Canvas, palette: DiagramPalette): StyledText {
  const chunks: TextChunk[] = []
  const height = Math.max(1, canvas.heightUsed())
  const width = Math.max(1, canvas.widthUsed())
  for (let y = 0; y < height; y += 1) {
    let run = ""
    let style: StyleName | undefined
    const flush = () => {
      if (run.length === 0) return
      chunks.push({ __isChunk: true, text: run, fg: colorFor(palette, style) } as TextChunk)
      run = ""
    }
    for (let x = 0; x < width; x += 1) {
      const cell = canvas.get(x, y)
      const nextStyle = cell?.style
      if (nextStyle !== style) {
        flush()
        style = nextStyle
      }
      run += cell && cell.ch !== "" ? cell.ch : " "
    }
    flush()
    chunks.push({ __isChunk: true, text: "\n" } as TextChunk)
  }
  return new StyledText(chunks)
}

/** Horizontal-scrollable static diagram block, mirroring the built-in renderer. */
export class DiagramRenderable extends TextRenderable {
  constructor(ctx: RenderContext, canvas: Canvas, palette: DiagramPalette) {
    super(ctx, {
      content: canvasToStyledText(canvas, palette),
      width: "100%",
      height: Math.max(1, canvas.heightUsed()),
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
  }
}
