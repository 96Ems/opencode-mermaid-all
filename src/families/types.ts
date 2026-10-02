import type { Canvas } from "../core/canvas.js"

export interface RenderOptions {
  width: number
}

export interface Family {
  name: string
  match(source: string): boolean
  render(source: string, options: RenderOptions): Canvas
}
