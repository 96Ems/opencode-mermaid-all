import { RGBA } from "@opentui/core"
import { Grid } from "../src/core/grid.js"
import { applyMotions } from "../src/core/motion.js"
import { sankeyRouteMotions } from "../src/motion-design.js"
import type { DiagramPalette } from "../src/palette.js"
import { findFamily } from "../src/families/index.js"

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
  sankey: `sankey-beta
A,B,10
A,C,5
B,D,8`,
  pie: `pie showData
    title Languages
    "TypeScript" : 55
    "Python" : 25
    "Go" : 20`,
  kanban: `kanban
  Todo
    [Create docs]
    [Write tests]
  Doing
    [Implement API]`,
}

for (const [name, source] of Object.entries(samples)) {
  const family = findFamily(source)
  if (!family) throw new Error(`${name}: no family matched`)
  const canvas = family.render(source, { width: 90 })
  const base = Grid.fromCanvas(canvas, palette)
  const motions = name === "sankey" ? sankeyRouteMotions(source, canvas) : []
  console.log(`\n======== ${name}: ${motions.length ? `${motions.length} semantic flows` : "static by design"} ========`)
  for (const seconds of [0, 0.7, 1.4]) {
    const frame = base.clone()
    applyMotions(frame, motions, seconds, palette)
    console.log(`\n--- t=${seconds.toFixed(1)}s ---`)
    console.log(frame.toStyledText().chunks.map((chunk) => chunk.text).join(""))
  }
}
