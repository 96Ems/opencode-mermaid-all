import { createTestRenderer } from "@opentui/core/testing"
import { createMermaidAllRenderer } from "../src/renderer.js"
import { activeAnimationCount } from "../src/animation.js"
import { findFamily } from "../src/families/index.js"

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
    S-->>U: 200 OK
    loop Every request
        U->>S: Request
        S-->>U: Response
    end`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading : load()
    Loading --> Success : ok
    Loading --> Error : fail
    Success --> Idle : reset()`,
  gantt: `gantt
    title Plan
    dateFormat YYYY-MM-DD
    section A
      Research :a1, 2024-01-01, 10d
      Design :after a1, 8d`,
  gitGraph: `gitGraph
    commit id: "init"
    branch develop
    commit id: "feat"
    checkout main
    merge develop`,
  timeline: `timeline
    title History
    section Early
      2000 : First
      2005 : Second`,
  classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
    }
    class Dog
    Animal <|-- Dog : extends`,
  pie: `pie showData
    title Languages
    "TypeScript" : 55
    "Python" : 25
    "Go" : 20`,
  quadrant: `quadrantChart
    title Priorities
    x-axis Low --> High
    y-axis Low --> High
    Task A: [0.3, 0.8]
    Task B: [0.7, 0.4]`,
  sankey: `sankey-beta
A,B,10
A,C,5
B,D,8`,
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 110, height: 36 })
const render = createMermaidAllRenderer(renderer, () => ({ theme: undefined, mode: "dark" }))

let failures = 0
for (const [name, source] of Object.entries(samples)) {
  console.log(`\n======== ${name} ========`)
  try {
    const node = render({ text: source } as never, { defaultRender: () => ({ id: `block-${name}` }) } as never)
    if (!node) {
      failures += 1
      console.log("renderer returned undefined")
      continue
    }
    renderer.root.add(node as never)
    const animated = activeAnimationCount() > 0
    await renderOnce()
    const first = captureCharFrame()
    await sleep(420)
    await renderOnce()
    const second = captureCharFrame()
    renderer.root.remove(node as never)
    ;(node as { destroy?: () => void }).destroy?.()

    const firstLines = first.split("\n")
    const hasArt = firstLines.some((line) => /[\u2500-\u257f\u2580-\u259f\u25a0-\u25ff]/.test(line))
    let changed = 0
    const height = Math.max(firstLines.length, second.split("\n").length)
    for (let i = 0; i < height; i += 1) {
      const a = first.split("\n")[i] ?? ""
      const b = second.split("\n")[i] ?? ""
      for (let x = 0; x < Math.max(a.length, b.length); x += 1) if (a[x] !== b[x]) changed += 1
    }
    const custom = findFamily(source)?.name ?? "vendored"
    console.log(`handler=${custom} art=${hasArt} cellsChanged=${changed} animatedJobs=${animated}`)
    if (!hasArt || changed === 0) {
      failures += 1
      console.log("---- frame ----")
      console.log(first.split("\n").slice(0, 24).join("\n"))
    }
  } catch (error) {
    failures += 1
    console.log("ERROR:", error instanceof Error ? error.stack ?? error.message : String(error))
  }
}

console.log(`\n${failures === 0 ? "ALL OK" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
