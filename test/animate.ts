import { RGBA } from "@opentui/core"
import { Grid } from "../src/core/grid.js"
import { applyMotions, collectMotions } from "../src/core/motion.js"
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
  pie: `pie showData
    title Languages
    "TypeScript" : 55
    "Python" : 25
    "Go" : 20`,
  xychart: `xychart-beta
    title "Sales"
    x-axis [jan, feb, mar, apr]
    y-axis "Units" 0 --> 100
    bar [30, 60, 90, 70]
    line [25, 55, 85, 65]`,
  radar: `radar-beta
    axis a["Speed"], b["Cost"], c["Quality"]
    curve x["Option A"]{1, 2, 3}
    curve y["Option B"]{3, 1, 2}
    max 4`,
  quadrant: `quadrantChart
    title Priorities
    x-axis Low effort --> High effort
    y-axis Low impact --> High impact
    quadrant-1 Quick wins
    quadrant-3 Skip
    Task A: [0.3, 0.8]
    Task B: [0.7, 0.4]`,
  sankey: `sankey-beta
A,B,10
A,C,5
B,D,8`,
  packet: `packet-beta
0-7: "Version"
8-15: "IHL"
16-31: "Total Length"
32-47: "Identification"`,
  classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
    }
    class Dog
    Animal <|-- Dog : extends`,
  kanban: `kanban
  Todo
    [Create docs]
    [Write tests]
  Doing
    [Implement API]
  Done
    [Setup]`,
}

const at = (grid: Grid, t: number): string => {
  const frame = grid.clone()
  applyMotions(frame, collectMotions(grid), t, palette)
  return frame.toStyledText().chunks.map((c) => c.text).join("")
}

let failures = 0
for (const [name, source] of Object.entries(samples)) {
  const family = findFamily(source)
  console.log(`\n======== ${name} -> ${family?.name ?? "NO MATCH"} ========`)
  if (!family) {
    failures += 1
    continue
  }
  try {
    const canvas = family.render(source, { width: 90 })
    const grid = Grid.fromCanvas(canvas, palette)
    const motions = collectMotions(grid)
    console.log(`motions: ${motions.length} (${[...new Set(motions.map((m) => m.kind))].join(",")})`)
    if (motions.length === 0) {
      failures += 1
      console.log("(NO MOTION)")
    }
    for (const t of [0, 0.7, 1.6]) {
      console.log(`\n--- frame t=${t}s ---`)
      console.log(at(grid, t))
    }
  } catch (error) {
    failures += 1
    console.log("ERROR:", error instanceof Error ? error.message : String(error))
  }
}

console.log(`\n${failures === 0 ? "ALL OK" : `${failures} FAILURE(S)`}`)
