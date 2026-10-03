import { drawFlowchartDiagramGrid } from "../vendor/merman/flowchart/drawing.js"
import { layoutFlowchartDiagram } from "../vendor/merman/flowchart/layout.js"
import { parseMermaidFlowchartDiagram } from "../vendor/merman/flowchart/parser.js"
import { directionBetween, shiftPoint, walkOrthogonalSegment } from "../vendor/merman/core/geometry.js"
import { flowchartSourceConnector } from "../vendor/merman/flowchart/routing.js"
import { drawSequenceDiagramGrid } from "../vendor/merman/sequence/drawing.js"
import { createSequencePlacementPlan } from "../vendor/merman/sequence/placement.js"
import { parseMermaidSequenceDiagram } from "../vendor/merman/sequence/parser.js"
import type { Canvas } from "./core/canvas.js"
import { makeFlow, type FlowMotion, type Motion, type NodeHighlightCell, type Point } from "./core/motion.js"
import { decodeLabel, sourceLines } from "./families/util.js"

function trimTopOfFlowchart(grid: ReturnType<typeof drawFlowchartDiagramGrid>): number {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if ((grid.getCell(x, y)?.char ?? " ").trim()) return y
    }
  }
  return 0
}

function flowchartRouteCells(points: Point[], trimTop: number, sourcePort: Point): Point[] {
  const cells: Point[] = [sourcePort]
  for (let index = 1; index < points.length; index += 1) {
    walkOrthogonalSegment(points[index - 1]!, points[index]!, index === 1, (point) => {
      cells.push({ x: point.x, y: point.y - trimTop })
    })
  }
  const arrowPoint = points.at(-1)
  const previous = points.at(-2)
  const direction = arrowPoint && previous ? directionBetween(previous, arrowPoint) : undefined
  if (arrowPoint && direction) {
    cells.push({ x: arrowPoint.x, y: arrowPoint.y - trimTop })
    const targetBorder = shiftPoint(arrowPoint, direction)
    cells.push({ x: targetBorder.x, y: targetBorder.y - trimTop })
  }
  return cells.filter((point, index) => {
    const previous = cells[index - 1]
    return index === 0 || point.x !== previous?.x || point.y !== previous?.y
  })
}

const NODE_STYLES = new Set(["node", "nodeBorder", "database", "databaseBorder"])
const NODE_DWELL_SECONDS = 0.35
const SOURCE_EXIT_SECONDS = 0.55
const TARGET_ENTRY_LEAD_SECONDS = 0.3
const BRANCH_STAGGER_SECONDS = 0.12
const FLOWCHART_CYCLE_PAUSE_SECONDS = 1

function flowchartNodeHighlightCells(
  shape: string,
  bounds: { left: number; top: number; width: number; height: number; centerX: number; centerY: number },
  grid: ReturnType<typeof drawFlowchartDiagramGrid>,
  trimTop: number,
): NodeHighlightCell[] {
  const cells = new Map<number, NodeHighlightCell>()
  const add = (x: number, rawY: number, kind: NodeHighlightCell["kind"]) => {
    const y = rawY - trimTop
    if (x < 0 || x >= grid.width || rawY < 0 || rawY >= grid.height || y < 0) return
    const key = y * grid.width + x
    const previous = cells.get(key)
    if (!previous || (previous.kind === "fill" && kind === "ink")) cells.set(key, { x, y, kind })
  }

  for (let y = bounds.top; y < bounds.top + bounds.height; y += 1) {
    for (let x = bounds.left; x < bounds.left + bounds.width; x += 1) {
      const cell = grid.getCell(x, y)
      if (!cell || !NODE_STYLES.has(cell.style ?? "")) continue
      const isBorder = cell.style === "nodeBorder" || cell.style === "databaseBorder"
      add(x, y, isBorder || cell.char.trim() ? "ink" : "fill")
    }
  }

  if (shape === "decision") {
    const radiusX = Math.max(1, (bounds.width - 1) / 2)
    const radiusY = Math.max(1, (bounds.height - 1) / 2)
    for (let y = bounds.top + 1; y < bounds.top + bounds.height - 1; y += 1) {
      for (let x = bounds.left + 1; x < bounds.left + bounds.width - 1; x += 1) {
        const normalized = Math.abs((x - bounds.centerX) / radiusX) + Math.abs((y - bounds.centerY) / radiusY)
        const cell = grid.getCell(x, y)
        if (normalized < 0.9 && (!cell || cell.char.trim() === "")) add(x, y, "fill")
      }
    }
  }

  return [...cells.values()]
}

interface RoutedFlow {
  motion: FlowMotion
  from: string
  to: string
}

function scheduleFlowchartRoutes(nodeIds: string[], flows: RoutedFlow[]): void {
  const incoming = new Map(nodeIds.map((id) => [id, [] as RoutedFlow[]]))
  const outgoing = new Map(nodeIds.map((id) => [id, [] as RoutedFlow[]]))
  const inDegree = new Map(nodeIds.map((id) => [id, 0]))
  for (const flow of flows) {
    incoming.get(flow.to)?.push(flow)
    outgoing.get(flow.from)?.push(flow)
    inDegree.set(flow.to, (inDegree.get(flow.to) ?? 0) + 1)
  }

  const queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0)
  let processed = 0
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    processed += 1
    const inputs = incoming.get(nodeId) ?? []
    const arrival = inputs.reduce(
      (latest, flow) => Math.max(latest, flow.motion.delay + flow.motion.travelDuration),
      0,
    )
    const departure = inputs.length > 0 ? arrival + NODE_DWELL_SECONDS : 0
    const outputs = outgoing.get(nodeId) ?? []
    outputs.forEach((flow, index) => {
      flow.motion.delay = departure + index * BRANCH_STAGGER_SECONDS
      const remaining = (inDegree.get(flow.to) ?? 0) - 1
      inDegree.set(flow.to, remaining)
      if (remaining === 0) queue.push(flow.to)
    })
  }

  // Cyclic diagrams have no topological start. Keep them readable with a
  // deterministic stagger rather than inventing an arbitrary traversal.
  if (processed !== nodeIds.length) {
    flows.forEach((flow, index) => {
      flow.motion.delay = index * BRANCH_STAGGER_SECONDS
    })
  }

  const cycleDuration =
    Math.max(
      0,
      ...flows.map((flow) => flow.motion.delay + flow.motion.travelDuration + flow.motion.destinationPause),
    ) + FLOWCHART_CYCLE_PAUSE_SECONDS
  for (const flow of flows) flow.motion.period = cycleDuration
}

/**
 * Flowcharts are the one place where a moving marker strongly clarifies
 * meaning. Use the actual layout route and only animate edges with exactly
 * one arrowhead; undirected and bidirectional edges have no single flow.
 */
export function flowchartRouteMotions(source: string, ctxWidth: number): Motion[] {
  try {
    const options = { compact: true, layoutMaxWidth: Math.min(120, Math.max(1, Math.floor(ctxWidth))) }
    const drawn = drawFlowchartDiagramGrid(parseMermaidFlowchartDiagram(source), options)
    const trimTop = trimTopOfFlowchart(drawn)
    const layout = layoutFlowchartDiagram(parseMermaidFlowchartDiagram(source), options)
    const motions: Motion[] = []
    const nodeKinds = new Map(layout.diagram.nodes.map((node) => [node.id, node.shape]))
    const nodeCells = new Map<string, NodeHighlightCell[]>()
    for (const [nodeId, bounds] of layout.bounds) {
      const shape = nodeKinds.get(nodeId)
      if (shape) nodeCells.set(nodeId, flowchartNodeHighlightCells(shape, bounds, drawn, trimTop))
    }
    const routedFlows: RoutedFlow[] = []

    for (const route of layout.routes) {
      const arrowAtSource = route.edge.sourceArrowhead === true
      const arrowAtTarget = route.edge.arrowhead !== false
      if (arrowAtSource === arrowAtTarget) continue

      const sourcePoint = route.points[0]
      const sourceBounds = layout.bounds.get(route.edge.from)
      if (!sourcePoint || !sourceBounds) continue
      const sourceConnector = flowchartSourceConnector(sourceBounds, sourcePoint)
      let cells = flowchartRouteCells(route.points, trimTop, {
        x: sourceConnector.x,
        y: sourceConnector.y - trimTop,
      })
      let from = route.edge.from
      let to = route.edge.to
      if (arrowAtSource) {
        cells = cells.reverse()
        ;[from, to] = [to, from]
      }
      if (cells.length < 2) continue

      const motion = makeFlow(cells, 0, "accent", {
        cellsPerSecond: 5,
        minimumDuration: 1.2,
      })
      const sourceHighlights = nodeCells.get(from) ?? []
      const targetHighlights = nodeCells.get(to) ?? []
      if (sourceHighlights.length) {
        motion.highlights.push({
          cells: sourceHighlights,
          start: 0,
          end: Math.min(SOURCE_EXIT_SECONDS, motion.travelDuration * 0.6),
        })
      }
      if (targetHighlights.length) {
        motion.highlights.push({
          cells: targetHighlights,
          start: Math.max(0, motion.travelDuration - TARGET_ENTRY_LEAD_SECONDS),
          end: motion.travelDuration + motion.destinationPause,
        })
      }
      routedFlows.push({ motion, from, to })
    }

    scheduleFlowchartRoutes(layout.diagram.nodes.map((node) => node.id), routedFlows)
    return routedFlows.map((flow) => flow.motion)
  } catch {
    return []
  }
}

/** Animate sequence messages along their actual message row, never lifelines or fragment frames. */
export function sequenceRouteMotions(source: string): Motion[] {
  try {
    const diagram = parseMermaidSequenceDiagram(source)
    const options = { compact: true }
    const plan = createSequencePlacementPlan(diagram, options)
    const grid = drawSequenceDiagramGrid(diagram, options)
    const motions: Motion[] = []

    for (const step of plan.steps) {
      if (step.type === "message") {
        const cells: Point[] = []
        const delta = step.direction
        for (let x = step.fromX; x !== step.headX; x += delta) {
          if (x < 0 || x >= grid.width || step.arrowY < 0 || step.arrowY >= grid.height) break
          cells.push({ x, y: step.arrowY })
        }
        if (cells.length >= 2) {
          motions.push(makeFlow(cells, motions.length * 0.42, step.message.style === "dashed" ? "accent2" : "accent"))
        }
        continue
      }

      if (step.type === "selfMessage") {
        const headX = step.message.head === undefined ? step.centerX : step.centerX + 1
        const cells: Point[] = []
        for (let x = step.centerX; x <= step.rightX; x += 1) cells.push({ x, y: step.topY })
        for (let y = step.topY + 1; y <= step.bottomY; y += 1) cells.push({ x: step.rightX, y })
        for (let x = step.rightX - 1; x > headX; x -= 1) cells.push({ x, y: step.bottomY })
        if (cells.length >= 2) {
          motions.push(makeFlow(cells, motions.length * 0.42, step.message.style === "dashed" ? "accent2" : "accent"))
        }
      }
    }
    return motions
  } catch {
    return []
  }
}

interface SankeyEdge {
  from: string
  to: string
  value: number
}

function splitCsv(line: string): string[] {
  const values: string[] = []
  let part = ""
  let quoted = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
    } else if (char === "," && !quoted) {
      values.push(part.trim())
      part = ""
    } else {
      part += char
    }
  }
  values.push(part.trim())
  return values
}

/** Sankey edges are rendered as an explicit left-to-right flow list. */
export function sankeyRouteMotions(source: string, canvas: Canvas): Motion[] {
  const edges: SankeyEdge[] = []
  const nodes = new Set<string>()
  for (const raw of sourceLines(source)) {
    const line = raw.trim()
    if (!line || line.startsWith("%%") || /^sankey-beta/i.test(line)) continue
    const parts = splitCsv(line)
    const value = Number(parts[2])
    if (parts.length < 3 || !Number.isFinite(value)) continue
    const from = decodeLabel(parts[0] ?? "")
    const to = decodeLabel(parts[1] ?? "")
    edges.push({ from, to, value })
    nodes.add(from)
    nodes.add(to)
  }
  if (edges.length === 0) return []

  const maxValue = Math.max(1, ...edges.map((edge) => edge.value))
  const firstEdgeY = 4 + nodes.size
  const motions: Motion[] = []
  edges.forEach((edge, index) => {
    if (edge.value <= 0) return
    const lineLength = Math.max(1, Math.round((edge.value / maxValue) * 10))
    const arrowHeadX = 13 + 2 + lineLength
    const y = firstEdgeY + index
    const cells: Point[] = []
    for (let x = 14; x < arrowHeadX && x < canvas.w; x += 1) cells.push({ x, y })
    if (cells.length >= 2) motions.push(makeFlow(cells, index * 0.32, "accent2"))
  })
  return motions
}
