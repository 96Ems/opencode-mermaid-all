import { RGBA } from "@opentui/core"
import { Grid } from "../src/core/grid.js"
import { applyMotions } from "../src/core/motion.js"
import { flowchartRouteMotions } from "../src/renderer.js"
import type { DiagramPalette } from "../src/palette.js"
import { drawFlowchartDiagramGrid } from "../vendor/merman/flowchart/drawing.js"
import { parseMermaidFlowchartDiagram } from "../vendor/merman/flowchart/parser.js"
import { renderGridStyledText, resolveFlowchartStyleColors } from "../vendor/merman/flowchart/style.js"

const palette: DiagramPalette = {
  text: RGBA.fromInts(228, 239, 232, 255),
  muted: RGBA.fromInts(140, 166, 156, 255),
  border: RGBA.fromInts(110, 130, 122, 255),
  dim: RGBA.fromInts(90, 105, 99, 255),
  accent: RGBA.fromInts(134, 225, 200, 255),
  accent2: RGBA.fromInts(120, 180, 255, 255),
  warn: RGBA.fromInts(255, 190, 90, 255),
  ok: RGBA.fromInts(120, 220, 130, 255),
  info: RGBA.fromInts(150, 170, 255, 255),
}

const source = `flowchart TD
    A([Start]) --> B{Decision?}
    B -->|yes| C[Step 1]
    B -->|no| D[Step 2]
    C --> E([End])
    D --> E`

const width = 120
const grid = drawFlowchartDiagramGrid(parseMermaidFlowchartDiagram(source), { compact: true, layoutMaxWidth: width })
const base = Grid.fromStyledText(renderGridStyledText(grid, resolveFlowchartStyleColors({})))

const motions = flowchartRouteMotions(source, width)
console.log(`routes with motion: ${motions?.length ?? 0}`)

// Verify each route's cells sit on drawn edge/connector cells (not text boxes).
const CONNECTORS = /[─━═│┃╌╍┄┅┆┇╭╮╰╯┌┐└┘├┤┬┴┼►◀▲▼]/
let onArt = 0
let offArt = 0
for (const motion of motions ?? []) {
  for (const cell of motion.cells) {
    const ch = base.get(cell.x, cell.y)?.ch ?? " "
    if (CONNECTORS.test(ch)) onArt += 1
    else offArt += 1
  }
}
console.log(`route cells on connector art: ${onArt}, off art: ${offArt}`)

const at = (t: number): string => {
  const frame = base.clone()
  applyMotions(frame, motions ?? [], t, palette)
  return frame.toStyledText().chunks.map((c) => c.text).join("")
}

for (const t of [0, 0.45, 0.9]) {
  console.log(`\n--- t=${t}s ---`)
  console.log(at(t))
}

const ok = (motions?.length ?? 0) > 0 && onArt > offArt * 3
console.log(`\n${ok ? "ALL OK" : "FAILURE"}`)
process.exit(ok ? 0 : 1)
