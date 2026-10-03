import { RGBA } from "@opentui/core"
import { Grid } from "../src/core/grid.js"
import { applyMotions } from "../src/core/motion.js"
import { flowchartRouteMotions } from "../src/motion-design.js"
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
const grid = drawFlowchartDiagramGrid(parseMermaidFlowchartDiagram(source), { compact: true, layoutMaxWidth: 120 })
const base = Grid.fromStyledText(renderGridStyledText(grid, resolveFlowchartStyleColors({})))
const motions = flowchartRouteMotions(source, 120)

for (const seconds of [0, 0.7, 1.4, 2.1]) {
  const frame = base.clone()
  applyMotions(frame, motions, seconds, palette)
  console.log(`\n--- t=${seconds.toFixed(1)}s ---`)
  console.log(frame.toStyledText().chunks.map((chunk) => chunk.text).join(""))
}
console.log(`\n${motions.length} directed edge motions; labels and arrowheads preserved`)
