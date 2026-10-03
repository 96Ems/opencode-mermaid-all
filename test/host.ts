import { strict as assert } from "node:assert"
import { createTestRenderer } from "@opentui/core/testing"
import { createMermaidAllRenderer } from "../src/renderer.js"
import { activeAnimationCount } from "../src/animation.js"

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

const animated = new Set(["flowchart", "sequence", "sankey"])
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 110, height: 36 })
const render = createMermaidAllRenderer(renderer, () => ({ theme: undefined, mode: "dark" }))

for (const [name, source] of Object.entries(samples)) {
  console.log(`\n======== ${name} ========`)
  const node = render({ text: source } as never, { defaultRender: () => ({ id: `block-${name}` }) } as never)
  assert.ok(node, `${name}: renderer returns a diagram`)
  renderer.root.add(node as never)

  const shouldAnimate = animated.has(name)
  assert.equal(activeAnimationCount() > 0, shouldAnimate, `${name}: animation is intentional`)
  await renderOnce()
  const first = captureCharFrame()
  await sleep(500)
  await renderOnce()
  const second = captureCharFrame()
  renderer.root.remove(node as never)
  ;(node as { destroy?: () => void }).destroy?.()

  const firstLines = first.split("\n")
  const hasArt = firstLines.some((line) => /[\u2500-\u257f\u2580-\u259f\u25a0-\u25ff]/.test(line))
  assert.ok(hasArt, `${name}: diagram renders in OpenTUI`)
  let changed = 0
  const secondLines = second.split("\n")
  for (let row = 0; row < Math.max(firstLines.length, secondLines.length); row += 1) {
    const a = firstLines[row] ?? ""
    const b = secondLines[row] ?? ""
    for (let col = 0; col < Math.max(a.length, b.length); col += 1) if (a[col] !== b[col]) changed += 1
  }

  if (shouldAnimate) assert.ok(changed > 0, `${name}: meaningful flow motion advances in the host`)
  else assert.equal(changed, 0, `${name}: static diagram remains still`)
  console.log(`art=${hasArt} changedCells=${changed} shouldAnimate=${shouldAnimate}`)
}

assert.equal(activeAnimationCount(), 0, "destroyed diagrams leave no animation jobs")
console.log("\nALL OK")
process.exit(0)
