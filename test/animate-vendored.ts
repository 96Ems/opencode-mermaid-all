import { RGBA } from "@opentui/core"
import { Grid } from "../src/core/grid.js"
import { applyMotions } from "../src/core/motion.js"
import { flowchartRouteMotions, sequenceRouteMotions } from "../src/motion-design.js"
import type { DiagramPalette } from "../src/palette.js"
import { drawFlowchartDiagramGrid } from "../vendor/merman/flowchart/drawing.js"
import { parseMermaidFlowchartDiagram } from "../vendor/merman/flowchart/parser.js"
import { renderGridStyledText, resolveFlowchartStyleColors } from "../vendor/merman/flowchart/style.js"
import { drawSequenceDiagramGrid } from "../vendor/merman/sequence/drawing.js"
import { parseMermaidSequenceDiagram } from "../vendor/merman/sequence/parser.js"
import { renderSequenceGridStyledText } from "../vendor/merman/sequence/render-grid.js"
import { resolveSequenceStyleColors } from "../vendor/merman/sequence/style.js"

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

const samples: Record<string, string> = {
  flowchart: `flowchart TD
    A([Start]) --> B{Decision?}
    B -->|yes| C[Step 1]
    B -->|no| D[Step 2]
    C --> E([End])
    D --> E`,
  sequence: `sequenceDiagram
    actor User
    participant API
    User->>API: POST /login
    API-->>User: 200 OK + token
    User->>User: store token`,
}

for (const [kind, source] of Object.entries(samples)) {
  let base: Grid
  let motions
  if (kind === "flowchart") {
    const raw = drawFlowchartDiagramGrid(parseMermaidFlowchartDiagram(source), { compact: true, layoutMaxWidth: 120 })
    base = Grid.fromStyledText(renderGridStyledText(raw, resolveFlowchartStyleColors({})))
    motions = flowchartRouteMotions(source, 120)
  } else {
    const raw = drawSequenceDiagramGrid(parseMermaidSequenceDiagram(source), { compact: true })
    base = Grid.fromStyledText(renderSequenceGridStyledText(raw, resolveSequenceStyleColors({})))
    motions = sequenceRouteMotions(source)
  }

  console.log(`\n======== ${kind}: ${motions.length} directed messages ========`)
  for (const seconds of [0, 0.6, 1.2]) {
    const frame = base.clone()
    applyMotions(frame, motions, seconds, palette)
    console.log(`\n--- t=${seconds.toFixed(1)}s ---`)
    console.log(frame.toStyledText().chunks.map((chunk) => chunk.text).join(""))
  }
}
