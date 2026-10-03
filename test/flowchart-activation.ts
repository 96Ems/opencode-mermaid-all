import { strict as assert } from "node:assert"
import type { CapturedFrame } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createMermaidAllRenderer } from "../src/renderer.js"

const source = `flowchart LR
  A[Source] --> B[Middle] --> C[Target]`
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function labelBackground(frame: CapturedFrame, label: string): number {
  for (const line of frame.lines) {
    const text = line.spans.map((span) => span.text).join("")
    const start = text.indexOf(label)
    if (start < 0) continue
    const end = start + label.length
    let offset = 0
    const alphas: number[] = []
    for (const span of line.spans) {
      const spanEnd = offset + span.text.length
      if (spanEnd > start && offset < end) alphas.push(span.bg.a)
      offset = spanEnd
    }
    return Math.min(...alphas)
  }
  throw new Error(`label ${label} missing from OpenTUI frame`)
}

const { renderer, renderOnce, captureSpans, captureCharFrame } = await createTestRenderer({ width: 80, height: 24 })
const render = createMermaidAllRenderer(renderer, () => ({ theme: undefined, mode: "dark" }))
const node = render({ text: source } as never, { defaultRender: () => ({ id: "flowchart-activation" }) } as never)
assert.ok(node, "flowchart should render through the real OpenTUI renderer")
renderer.root.add(node as never)

try {
  await renderOnce()
  await sleep(120)
  const sourceActive = captureSpans()
  assert.ok(labelBackground(sourceActive, "Source") > 0, "the source block lights while the dot leaves it")
  assert.equal(labelBackground(sourceActive, "Middle"), 0, "the next block remains idle before arrival")

  await sleep(450)
  await renderOnce()
  const midRoute = captureCharFrame()
  const dots = midRoute.split("\n").flatMap((line, y) =>
    Array.from(line).flatMap((character, x) => (character === "●" ? [{ x, y }] : [])),
  )
  assert.equal(dots.length, 1, "only the current edge has a moving dot")
  assert.ok(dots[0]!.x < 20, "the dot takes time to travel the short horizontal edge")
  assert.equal(labelBackground(captureSpans(), "Source"), 0, "the source returns to idle after the dot exits")

  await sleep(650)
  await renderOnce()
  assert.ok(labelBackground(captureSpans(), "Middle") > 0, "the middle block lights as the dot arrives")

  await sleep(1_000)
  await renderOnce()
  assert.equal(labelBackground(captureSpans(), "Middle"), 0, "the middle block returns to idle after the outgoing dot leaves")
} finally {
  renderer.root.remove(node as never)
  ;(node as { destroy?: () => void }).destroy?.()
  renderer.destroy()
}

console.log("flowchart-activation: paced edge, source exit, target arrival, target exit")
