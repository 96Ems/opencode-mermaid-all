import { RGBA } from "@opentui/core"
import { Grid } from "../src/core/grid.js"
import { applyMotions, collectMotions } from "../src/core/motion.js"
import type { DiagramPalette, } from "../src/palette.js"

import { drawFlowchartDiagramGrid } from "../vendor/merman/flowchart/drawing.js"
import { parseMermaidFlowchartDiagram } from "../vendor/merman/flowchart/parser.js"
import { renderGridStyledText, resolveFlowchartStyleColors } from "../vendor/merman/flowchart/style.js"
import { drawSequenceDiagramGrid } from "../vendor/merman/sequence/drawing.js"
import { parseMermaidSequenceDiagram } from "../vendor/merman/sequence/parser.js"
import { renderSequenceGridStyledText } from "../vendor/merman/sequence/render-grid.js"
import { resolveSequenceStyleColors } from "../vendor/merman/sequence/style.js"
import { drawStateDiagramGrid } from "../vendor/merman/state/drawing.js"
import { parseMermaidStateDiagram } from "../vendor/merman/state/parser.js"
import { renderStateGridStyledText } from "../vendor/merman/state/render-grid.js"
import { resolveStateStyleColors } from "../vendor/merman/state/style.js"
import { drawGanttDiagramGrid } from "../vendor/merman/gantt/drawing.js"
import { parseMermaidGanttDiagram } from "../vendor/merman/gantt/parser.js"
import { renderGanttGridStyledText } from "../vendor/merman/gantt/render-grid.js"
import { resolveGanttStyleColors } from "../vendor/merman/gantt/style.js"
import { drawGitGraphDiagramGrid } from "../vendor/merman/gitgraph/drawing.js"
import { parseMermaidGitGraphDiagram } from "../vendor/merman/gitgraph/parser.js"
import { renderGitGraphGridStyledText } from "../vendor/merman/gitgraph/render-grid.js"
import { resolveGitGraphStyleColors } from "../vendor/merman/gitgraph/style.js"
import { drawTimelineDiagramGrid } from "../vendor/merman/timeline/drawing.js"
import { parseMermaidTimelineDiagram } from "../vendor/merman/timeline/parser.js"
import { renderTimelineGridStyledText } from "../vendor/merman/timeline/render-grid.js"
import { resolveTimelineStyleColors } from "../vendor/merman/timeline/style.js"

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

function build(kind: string, source: string): Grid {
  const maxWidth = 120
  switch (kind) {
    case "flowchart": {
      const g = drawFlowchartDiagramGrid(parseMermaidFlowchartDiagram(source), { compact: true, layoutMaxWidth: maxWidth })
      return Grid.fromStyledText(renderGridStyledText(g, resolveFlowchartStyleColors({})))
    }
    case "sequence": {
      const g = drawSequenceDiagramGrid(parseMermaidSequenceDiagram(source), { compact: true })
      return Grid.fromStyledText(renderSequenceGridStyledText(g, resolveSequenceStyleColors({})))
    }
    case "state": {
      const g = drawStateDiagramGrid(parseMermaidStateDiagram(source), { layoutMaxWidth: maxWidth })
      return Grid.fromStyledText(renderStateGridStyledText(g, resolveStateStyleColors({}), {}))
    }
    case "gantt": {
      const g = drawGanttDiagramGrid(parseMermaidGanttDiagram(source), { layoutMaxWidth: maxWidth })
      return Grid.fromStyledText(renderGanttGridStyledText(g, resolveGanttStyleColors({})))
    }
    case "gitGraph": {
      const g = drawGitGraphDiagramGrid(parseMermaidGitGraphDiagram(source))
      return Grid.fromStyledText(renderGitGraphGridStyledText(g, resolveGitGraphStyleColors({})))
    }
    case "timeline": {
      const g = drawTimelineDiagramGrid(parseMermaidTimelineDiagram(source))
      return Grid.fromStyledText(renderTimelineGridStyledText(g, resolveTimelineStyleColors({})))
    }
    default:
      throw new Error(`unknown kind ${kind}`)
  }
}

const samples: Record<string, string> = {
  flowchart: `flowchart TD
    A([Start]) --> B{Decision?}
    B -->|yes| C[Step 1]
    B -->|no| D[Step 2]
    C --> E([End])
    D --> E`,
  sequence: `sequenceDiagram
    actor U as User
    participant S as Server
    U->>S: POST /login
    S-->>U: 200 OK + token
    loop Every request
        U->>S: Request
        S-->>U: Response
    end`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading : load()
    Loading --> Success : ok
    Loading --> Error : fail
    Success --> Idle : reset()
    Error --> Idle : retry()`,
  gantt: `gantt
    title Project plan
    dateFormat YYYY-MM-DD
    section Concept
      Research :a1, 2024-01-01, 10d
      Design :after a1, 8d
    section Build
      Code :2024-01-20, 20d
      More :2024-02-10, 10d`,
  gitGraph: `gitGraph
    commit id: "init"
    branch develop
    commit id: "feat"
    checkout main
    merge develop
    commit id: "release"`,
  timeline: `timeline
    title History
    section Early
      2000 : First
      2005 : Second
    section Later
      2010 : Third`,
}

function plain(grid: Grid, t: number): string {
  const frame = grid.clone()
  applyMotions(frame, collectMotions(grid), t, palette)
  return frame.toStyledText().chunks.map((c) => c.text).join("")
}

function diff(grid: Grid, t0: number, t1: number): { x: number; y: number; from: string; to: string }[] {
  const a = plain(grid, t0).split("\n")
  const b = plain(grid, t1).split("\n")
  const out: { x: number; y: number; from: string; to: string }[] = []
  for (let y = 0; y < Math.max(a.length, b.length); y += 1) {
    const ra = a[y] ?? ""
    const rb = b[y] ?? ""
    for (let x = 0; x < Math.max(ra.length, rb.length); x += 1) {
      if (ra[x] !== rb[x]) out.push({ x, y, from: ra[x] ?? " ", to: rb[x] ?? " " })
    }
  }
  return out
}

let failures = 0
for (const [kind, source] of Object.entries(samples)) {
  console.log(`\n======== ${kind} ========`)
  try {
    const grid = build(kind, source)
    const motions = collectMotions(grid)
    console.log(`grid ${grid.w}x${grid.h}, motions: ${motions.length} (${[...new Set(motions.map((m) => m.kind))].join(",")})`)
    if (motions.length === 0) {
      failures += 1
      console.log("(NO MOTION)")
      console.log("---- base frame ----")
      console.log(plain(grid, 0))
      continue
    }
    const changes = diff(grid, 0, 0.6)
    console.log(`cells changed between t=0 and t=0.6: ${changes.length}`)
    console.log("sample:", JSON.stringify(changes.slice(0, 12)))
    if (changes.length === 0) {
      console.log("---- base frame ----")
      console.log(plain(grid, 0))
    }
  } catch (error) {
    failures += 1
    console.log("ERROR:", error instanceof Error ? error.stack ?? error.message : String(error))
  }
}

console.log(`\n${failures === 0 ? "ALL OK" : `${failures} FAILURE(S)`}`)
