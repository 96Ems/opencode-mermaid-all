import { strict as assert } from "node:assert"
import { RGBA } from "@opentui/core"
import { Grid } from "../src/core/grid.js"
import { applyMotions, isFlowTrackGlyph, makeFlow, type Point } from "../src/core/motion.js"
import { flowchartRouteMotions, sankeyRouteMotions, sequenceRouteMotions } from "../src/motion-design.js"
import { findFamily } from "../src/families/index.js"
import type { DiagramPalette } from "../src/palette.js"
import { layoutFlowchartDiagram } from "../vendor/merman/flowchart/layout.js"
import { parseMermaidFlowchartDiagram } from "../vendor/merman/flowchart/parser.js"
import { drawFlowchartDiagramGrid } from "../vendor/merman/flowchart/drawing.js"
import { renderGridStyledText, resolveFlowchartStyleColors } from "../vendor/merman/flowchart/style.js"
import { walkOrthogonalSegment } from "../vendor/merman/core/geometry.js"
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

const flowchart = `flowchart LR
  A[Source] -->|request| B{Decision}
  B -->|yes| C[Target one]
  B -->|no| D[Target two]`
const options = { compact: true, layoutMaxWidth: 120 }
const MARKER = "●"

function routeCells(points: Point[], trimTop: number): Point[] {
  const cells: Point[] = []
  for (let i = 1; i < points.length; i += 1) {
    walkOrthogonalSegment(points[i - 1]!, points[i]!, i === 1, (point) => {
      cells.push({ x: point.x, y: point.y - trimTop })
    })
  }
  return cells.filter((point, index) => {
    const previous = cells[index - 1]
    return index === 0 || point.x !== previous?.x || point.y !== previous?.y
  })
}

function assertOnlyDotsOnTracks(base: Grid, frame: Grid, label: string): number {
  let markers = 0
  for (let y = 0; y < base.h; y += 1) {
    for (let x = 0; x < base.w; x += 1) {
      const before = base.get(x, y)?.ch ?? " "
      const after = frame.get(x, y)?.ch ?? " "
      if (after === MARKER) {
        markers += 1
        assert.ok(isFlowTrackGlyph(before), `${label}: marker overwrote non-track ${JSON.stringify(before)} at ${x},${y}`)
      } else {
        assert.equal(after, before, `${label}: animation changed non-marker cell ${x},${y}`)
      }
    }
  }
  return markers
}

// Route geometry: each edge is ordered from source to its one arrowhead. An
// arrow at the source reverses that order; undirected/bidirectional edges stay still.
const flowGrid = drawFlowchartDiagramGrid(parseMermaidFlowchartDiagram(flowchart), options)
let trimTop = 0
while (trimTop < flowGrid.height) {
  let found = false
  for (let x = 0; x < flowGrid.width; x += 1) {
    if ((flowGrid.getCell(x, trimTop)?.char ?? " ").trim()) {
      found = true
      break
    }
  }
  if (found) break
  trimTop += 1
}
const layout = layoutFlowchartDiagram(parseMermaidFlowchartDiagram(flowchart), options)
const routes = layout.routes.filter((route) => (route.edge.arrowhead !== false) !== (route.edge.sourceArrowhead === true))
const flowMotions = flowchartRouteMotions(flowchart, 120)
assert.equal(flowMotions.length, routes.length, "one flow per one-way arrow, no flow for unoriented edges")
for (const [index, route] of routes.entries()) {
  const expected = routeCells(route.points, trimTop)
  if (route.edge.sourceArrowhead) expected.reverse()
  const actual = flowMotions[index]?.cells ?? []
  assert.deepEqual(
    actual.slice(1, expected.length + 1),
    expected,
    `${route.edge.from} → ${route.edge.to} motion follows arrow direction between its node ports`,
  )
}
assert.equal(flowchartRouteMotions(`flowchart LR\n A[Source] --- B[Target]`, 120).length, 0, "undirected connector stays still")
const bidirectional = `flowchart LR\n A[Left] <--> B[Right]`
assert.equal(flowchartRouteMotions(bidirectional, 120).length, 0, "bidirectional arrows have no implied one-way flow")

// Labels are part of route timing, but are never overwritten. The marker may
// disappear under a label and emerge on the next connector segment.
const flowBase = Grid.fromStyledText(renderGridStyledText(flowGrid, resolveFlowchartStyleColors({})))
for (let frameIndex = 0; frameIndex <= 120; frameIndex += 1) {
  const frame = flowBase.clone()
  applyMotions(frame, flowMotions, frameIndex / 20, palette)
  assert.ok(assertOnlyDotsOnTracks(flowBase, frame, "flowchart") <= flowMotions.length)
}

// Sequence messages are animated from sender to receiver (including responses
// that travel right-to-left), not on lifelines, labels, or fragment borders.
const sequence = `sequenceDiagram
  participant Client
  participant API
  Client->>API: GET /data
  API-->>Client: 200 OK
  Client->>Client: parse response`
const sequenceDiagram = parseMermaidSequenceDiagram(sequence)
const sequenceGrid = drawSequenceDiagramGrid(sequenceDiagram, { compact: true })
const sequenceBase = Grid.fromStyledText(
  renderSequenceGridStyledText(sequenceGrid, resolveSequenceStyleColors({})),
)
const sequenceMotions = sequenceRouteMotions(sequence)
assert.equal(sequenceMotions.length, 3, "one flow per sequence message")
assert.ok(
  sequenceMotions[0]!.cells[0]!.x < sequenceMotions[0]!.cells.at(-1)!.x,
  "request animation follows sender to receiver",
)
assert.ok(
  sequenceMotions[1]!.cells[0]!.x > sequenceMotions[1]!.cells.at(-1)!.x,
  "response animation follows the reverse arrow",
)
for (let frameIndex = 0; frameIndex <= 120; frameIndex += 1) {
  const frame = sequenceBase.clone()
  applyMotions(frame, sequenceMotions, frameIndex / 20, palette)
  assert.ok(assertOnlyDotsOnTracks(sequenceBase, frame, "sequence") <= sequenceMotions.length)
}

// Sankey is another semantic flow diagram; the moving marker stays on its
// arrows. Other custom families receive no inferred motion from decorative glyphs.
const sankeySource = `sankey-beta\nA,B,10\nA,C,5\nB,D,8`
const sankeyCanvas = findFamily(sankeySource)!.render(sankeySource, { width: 90 })
const sankeyBase = Grid.fromCanvas(sankeyCanvas, palette)
const sankeyMotions = sankeyRouteMotions(sankeySource, sankeyCanvas)
assert.equal(sankeyMotions.length, 3, "one flow per Sankey edge")
for (let frameIndex = 0; frameIndex <= 120; frameIndex += 1) {
  const frame = sankeyBase.clone()
  applyMotions(frame, sankeyMotions, frameIndex / 20, palette)
  assert.ok(assertOnlyDotsOnTracks(sankeyBase, frame, "sankey") <= sankeyMotions.length)
}

// A 120-cell route must show one dot only and advance at most one terminal
// cell per 20fps frame. This catches the old 3-glyph comet and skipped cells.
const longLine = new Grid(120, 1)
const cells: Point[] = []
for (let x = 0; x < longLine.w; x += 1) {
  longLine.set(x, 0, "─", palette.muted)
  cells.push({ x, y: 0 })
}
const longMotion = makeFlow(cells)
let previous = -1
for (let frameIndex = 0; frameIndex <= 20 * 3; frameIndex += 1) {
  const frame = longLine.clone()
  applyMotions(frame, [longMotion], frameIndex / 20, palette)
  const positions: number[] = []
  for (let x = 0; x < frame.w; x += 1) if (frame.get(x, 0)?.ch === MARKER) positions.push(x)
  assert.equal(positions.length, 1, "flow motion is a single dot")
  const current = positions[0]!
  assert.ok(current >= previous, "flow motion never travels backwards")
  assert.ok(current - previous <= 1, "flow motion advances no more than one cell per frame")
  previous = current
}

console.log(`motion-quality: ${flowMotions.length} directed flowchart routes, ${sequenceMotions.length} sequence messages, ${sankeyMotions.length} Sankey edges; no label overwrites; single-dot at 20fps`)
