import { Canvas, type StyleName } from "../core/canvas.js"
import { padEnd, textWidth, truncate, wrapText } from "../core/text.js"
import type { Family, RenderOptions } from "./types.js"
import { clamp, decodeLabel, firstMeaningfulLine, sourceLines } from "./util.js"

function titleOf(lines: string[]): string {
  for (const raw of lines) {
    const match = raw.trim().match(/^title\s+(.*)$/i)
    if (match) return decodeLabel(match[1])
  }
  return ""
}

/* ------------------------------------------------------------------ pie --- */

function renderPie(source: string, options: RenderOptions): Canvas {
  const lines = sourceLines(source)
  const title = titleOf(lines)
  const slices: { label: string; value: number }[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("%%") || /^pie\b/i.test(line) || /^title\b/i.test(line)) continue
    const match = line.match(/^"?(.+?)"?\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*$/)
    if (match) slices.push({ label: decodeLabel(match[1]), value: Number(match[2]) })
  }
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const labelWidth = clamp(
    Math.max(4, ...slices.map((slice) => textWidth(slice.label))),
    4,
    Math.max(6, Math.floor(options.width * 0.35)),
  )
  const percentWidth = 7
  const valueWidth = Math.max(3, ...slices.map((slice) => String(slice.value).length))
  const barWidth = clamp(options.width - labelWidth - percentWidth - valueWidth - 3, 6, 60)
  const height = (title ? 2 : 0) + slices.length + 1
  const canvas = new Canvas(options.width, height)
  let y = 0
  if (title) {
    canvas.text(0, y, truncate(title, options.width), "text")
    y += 2
  }
  slices.forEach((slice, index) => {
    const ratio = total > 0 ? slice.value / total : 0
    const barLength = Math.max(ratio > 0 ? 1 : 0, Math.round(ratio * barWidth))
    const style: StyleName = index % 2 === 0 ? "accent" : "accent2"
    canvas.text(0, y, padEnd(truncate(slice.label, labelWidth), labelWidth), "text")
    canvas.text(labelWidth + 1, y, "\u2588".repeat(barLength), style)
    const percent = `${(ratio * 100).toFixed(1)}%`
    canvas.text(labelWidth + barWidth + 2, y, padEnd(percent, percentWidth - 1), "muted")
    canvas.text(labelWidth + barWidth + percentWidth + 2, y, String(slice.value), "dim")
    y += 1
  })
  canvas.text(0, y, `total ${total}`, "dim")
  return canvas
}

/* --------------------------------------------------------------- xychart --- */

interface Series {
  kind: "bar" | "line"
  values: number[]
}

function parseNumberList(text: string): number[] {
  const inner = text.slice(text.indexOf("[") + 1, text.lastIndexOf("]"))
  return inner
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value))
}

function renderXyChart(source: string, options: RenderOptions): Canvas {
  const lines = sourceLines(source)
  const title = titleOf(lines)
  let categories: string[] = []
  let xLabel = ""
  let yLabel = ""
  let yMin: number | undefined
  let yMax: number | undefined
  const series: Series[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("%%")) continue
    const bar = line.match(/^bar\s*(\[.*\])/i)
    if (bar) {
      series.push({ kind: "bar", values: parseNumberList(bar[1]) })
      continue
    }
    const lineSeries = line.match(/^line\s*(\[.*\])/i)
    if (lineSeries) {
      series.push({ kind: "line", values: parseNumberList(lineSeries[1]) })
      continue
    }
    if (/^x-axis/i.test(line)) {
      const quoted = line.match(/^x-axis\s+"([^"]*)"\s*(\[.*\])/i)
      if (quoted) {
        xLabel = quoted[1]
        categories = quoted[2]
          .slice(1, -1)
          .split(",")
          .map((value) => decodeLabel(value.trim()))
      } else {
        const list = line.match(/\[(.*)\]/)
        if (list)
          categories = list[1].split(",").map((value) => decodeLabel(value.trim()))
      }
      continue
    }
    if (/^y-axis/i.test(line)) {
      const quoted = line.match(/^y-axis\s+"([^"]*)"\s*(.*)$/i)
      const rest = quoted ? quoted[2] : line.replace(/^y-axis\s*/i, "")
      if (quoted) yLabel = quoted[1]
      const range = rest.match(/(-?[0-9.]+)\s*-->\s*(-?[0-9.]+)/)
      if (range) {
        yMin = Number(range[1])
        yMax = Number(range[2])
      }
    }
  }
  const allValues = series.flatMap((entry) => entry.values)
  const dataMin = allValues.length ? Math.min(...allValues) : 0
  const dataMax = allValues.length ? Math.max(...allValues) : 1
  const low = yMin ?? Math.min(0, dataMin)
  const high = yMax ?? Math.max(1, dataMax)
  const pointCount = Math.max(categories.length, ...series.map((entry) => entry.values.length), 0)
  const chartHeight = clamp(Math.round(options.width / 4), 6, 12)
  const gutter = Math.max(3, String(Math.round(high)).length, String(Math.round(low)).length) + 1
  const chartWidth = Math.max(4, options.width - gutter - 1)
  const height = (title ? 2 : 0) + chartHeight + 2 + series.length
  const canvas = new Canvas(options.width, height)
  let originY = 0
  if (title) {
    canvas.text(0, originY, truncate(title, options.width), "text")
    originY += 2
  }
  const rows = chartHeight
  const top = originY
  const base = top + rows - 1
  const scale = (value: number) => {
    if (high === low) return base
    const ratio = (value - low) / (high - low)
    return clamp(Math.round(base - ratio * (rows - 1)), top, base)
  }
  for (let row = 0; row <= rows; row += 1) {
    const value = high - (row / rows) * (high - low)
    canvas.text(0, top + row, padEnd(String(Math.round(value)), gutter - 1), "dim")
    canvas.hline(gutter, top + row, chartWidth, "\u00b7", "dim")
  }
  const slot = chartWidth / Math.max(1, pointCount)
  const barWidth = clamp(Math.floor(slot) - 1, 1, 4)
  series.forEach((entry) => {
    if (entry.kind === "bar") {
      entry.values.forEach((value, index) => {
        const x = Math.round(gutter + slot * (index + 0.5) - barWidth / 2)
        const y = scale(value)
        canvas.vline(clamp(x, gutter, gutter + chartWidth - 1), y, base - y + 1, "\u2588", "accent")
        if (barWidth > 1) {
          for (let k = 1; k < barWidth; k += 1)
            canvas.vline(clamp(x + k, gutter, gutter + chartWidth - 1), y, base - y + 1, "\u2588", "accent")
        }
      })
    }
  })
  series.forEach((entry) => {
    if (entry.kind !== "line") return
    let previous: { x: number; y: number } | undefined
    entry.values.forEach((value, index) => {
      const x = Math.round(gutter + slot * (index + 0.5))
      const y = scale(value)
      if (previous) {
        const steps = Math.max(1, Math.abs(x - previous.x))
        for (let step = 0; step <= steps; step += 1) {
          const cx = Math.round(previous.x + ((x - previous.x) * step) / steps)
          const cy = Math.round(previous.y + ((y - previous.y) * step) / steps)
          canvas.set(cx, cy, "\u2022", "accent2")
        }
      }
      canvas.set(x, y, "\u25cf", "accent2")
      previous = { x, y }
    })
  })
  let labelY = originY + rows + 1
  const step = Math.max(1, Math.ceil(pointCount / Math.max(1, Math.floor(chartWidth / 3))))
  categories.forEach((category, index) => {
    if (index % step !== 0) return
    const x = Math.round(gutter + slot * (index + 0.5) - textWidth(category) / 2)
    canvas.text(Math.max(0, x), labelY, truncate(category, Math.max(1, Math.floor(slot) * step)), "muted")
  })
  labelY += 1
  const legend: string[] = []
  for (const entry of series) legend.push(`${entry.kind === "bar" ? "\u2588" : "\u2500"} ${entry.kind}`)
  if (yLabel) legend.push(`y: ${yLabel}`)
  if (xLabel) legend.push(`x: ${xLabel}`)
  if (legend.length) canvas.text(0, labelY, truncate(legend.join("   "), options.width), "dim")
  return canvas
}

/* ----------------------------------------------------------------- radar --- */

function renderRadar(source: string, options: RenderOptions): Canvas {
  const lines = sourceLines(source)
  const title = titleOf(lines)
  const axes: string[] = []
  const curves: { label: string; values: number[] }[] = []
  let max: number | undefined
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("%%") || /^radar-beta/i.test(line)) continue
    if (/^axis\b/i.test(line)) {
      for (const part of line.replace(/^axis\s*/i, "").split(",")) {
        const match = part.match(/^\s*[\w-]+\s*(?:\[\s*"?([^"\]]*)"?\s*\])?/)
        axes.push(decodeLabel(match?.[1] ?? part.trim()) || part.trim())
      }
      continue
    }
    const curve = line.match(/^curve\s+([\w-]+)\s*(?:\[\s*"?([^"\]]*)"?\s*\])?\s*\{([^}]*)\}/i)
    if (curve) {
      const values = curve[3].split(",").map((value) => Number(value.trim())).filter(Number.isFinite)
      curves.push({ label: decodeLabel(curve[2] ?? curve[1]), values })
      continue
    }
    const maxMatch = line.match(/^max\s+([0-9.]+)/i)
    if (maxMatch) max = Number(maxMatch[1])
  }
  const dataMax = Math.max(...curves.flatMap((curve) => curve.values), 1)
  const scaleMax = max ?? dataMax
  const barWidth = clamp(options.width - 20, 8, 50)
  const rows: string[] = []
  const body: { label: string; value?: number; kind: "axis" | "curve" }[] = []
  for (const axis of axes) body.push({ label: axis, kind: "axis" })
  curves.forEach((curve, index) => {
    body.push({ label: index === 0 ? curve.label : curve.label, kind: "curve" })
    curve.values.forEach((value, axisIndex) => {
      body.push({ label: axes[axisIndex] ?? `axis ${axisIndex + 1}`, value, kind: "curve" })
    })
    body.push({ label: "", kind: "curve" })
  })
  const height = (title ? 2 : 0) + body.length + 1
  const canvas = new Canvas(options.width, height)
  let y = 0
  if (title) {
    canvas.text(0, y, truncate(title, options.width), "text")
    y += 2
  }
  for (const row of body) {
    if (row.kind === "axis") {
      canvas.text(0, y, `\u25c6 ${truncate(row.label, options.width - 2)}`, "info")
      y += 1
      continue
    }
    if (row.value === undefined) {
      if (row.label) {
        canvas.text(0, y, `\u25cf ${truncate(row.label, options.width - 2)}`, "accent")
        y += 1
      }
      continue
    }
    const ratio = scaleMax > 0 ? row.value / scaleMax : 0
    const length = Math.max(ratio > 0 ? 1 : 0, Math.round(ratio * barWidth))
    const label = padEnd(truncate(row.label, 14), 14)
    canvas.text(2, y, label, "muted")
    canvas.text(17, y, "\u2588".repeat(length), "accent2")
    canvas.text(18 + barWidth, y, String(row.value), "dim")
    y += 1
  }
  return canvas
}

/* -------------------------------------------------------------- quadrant --- */

function renderQuadrant(source: string, options: RenderOptions): Canvas {
  const lines = sourceLines(source)
  const title = titleOf(lines)
  const xAxis = { low: "low", high: "high" }
  const yAxis = { low: "low", high: "high" }
  const quadrants: Record<string, string> = {}
  const points: { label: string; x: number; y: number }[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("%%") || /^quadrantChart/i.test(line) || /^title\b/i.test(line)) continue
    const xa = line.match(/^x-axis\s+(.*?)\s*-->\s*(.*)$/i)
    if (xa) {
      xAxis.low = decodeLabel(xa[1])
      xAxis.high = decodeLabel(xa[2])
      continue
    }
    const ya = line.match(/^y-axis\s+(.*?)\s*-->\s*(.*)$/i)
    if (ya) {
      yAxis.low = decodeLabel(ya[1])
      yAxis.high = decodeLabel(ya[2])
      continue
    }
    const quad = line.match(/^quadrant-([1-4])\s+(.*)$/i)
    if (quad) {
      quadrants[quad[1]] = decodeLabel(quad[2])
      continue
    }
    const point = line.match(/^(.*?)\s*:\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\s*$/)
    if (point)
      points.push({ label: decodeLabel(point[1]), x: Number(point[2]), y: Number(point[3]) })
  }
  const plotHeight = clamp(Math.round(options.width / 5), 8, 16)
  const gutter = 3
  const plotWidth = Math.max(10, options.width - gutter - 2)
  const height = (title ? 2 : 0) + plotHeight + 2 + points.length + 1
  const canvas = new Canvas(options.width, height)
  let top = 0
  if (title) {
    canvas.text(0, top, truncate(title, options.width), "text")
    top += 2
  }
  const left = gutter
  const midX = left + Math.floor(plotWidth / 2)
  const midY = top + Math.floor(plotHeight / 2)
  for (let row = 0; row < plotHeight; row += 1) canvas.set(gutter - 1, top + row, row === 0 ? "\u2191" : row === plotHeight - 1 ? "\u2193" : "\u2502", "border")
  canvas.vline(midX, top, plotHeight, "\u2502", "dim")
  canvas.hline(left, midY, plotWidth, "\u2500", "dim")
  for (let col = 0; col < plotWidth; col += 1)
    canvas.set(left + col, top + plotHeight - 1, "\u2500", "border")
  const labelAt = (x: number, row: number, text: string, style: StyleName) =>
    canvas.text(clamp(x, 0, options.width - textWidth(text)), row, text, style)
  labelAt(left, midY - 1, `${yAxis.high} ^`, "muted")
  labelAt(left, top + 1, quadrants["2"] ? truncate(quadrants["2"], plotWidth / 2 - 2) : "", "info")
  labelAt(midX + 1, top + 1, quadrants["1"] ? truncate(quadrants["1"], plotWidth / 2 - 2) : "", "info")
  labelAt(left, midY + 1, quadrants["3"] ? truncate(quadrants["3"], plotWidth / 2 - 2) : "", "info")
  labelAt(midX + 1, midY + 1, quadrants["4"] ? truncate(quadrants["4"], plotWidth / 2 - 2) : "", "info")
  labelAt(midX, top + plotHeight, `x: ${xAxis.low} \u2192 ${xAxis.high}`, "muted")
  const dotStyles: StyleName[] = ["accent", "accent2", "ok", "warn", "info"]
  points.forEach((point, index) => {
    const px = left + clamp(Math.round(point.x * (plotWidth - 1)), 0, plotWidth - 1)
    const py = top + clamp(Math.round((1 - point.y) * (plotHeight - 1)), 0, plotHeight - 1)
    canvas.set(px, py, "\u25cf", dotStyles[index % dotStyles.length])
  })
  let y = top + plotHeight + 2
  points.forEach((point, index) => {
    canvas.text(0, y, "\u25cf", dotStyles[index % dotStyles.length])
    canvas.text(2, y, truncate(point.label, options.width - 12), "text")
    canvas.text(options.width - 9, y, `(${point.x},${point.y})`, "dim")
    y += 1
  })
  return canvas
}

/* --------------------------------------------------------------- sankey --- */

function splitCsv(line: string): string[] {
  const out: string[] = []
  let current = ""
  let quoted = false
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (ch === "," && !quoted) {
      out.push(current)
      current = ""
      continue
    }
    current += ch
  }
  out.push(current)
  return out.map((value) => value.trim())
}

function renderSankey(source: string, options: RenderOptions): Canvas {
  const lines = sourceLines(source)
  const edges: { from: string; to: string; value: number }[] = []
  const order: string[] = []
  const totals = new Map<string, number>()
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("%%") || /^sankey-beta/i.test(line)) continue
    const parts = splitCsv(line)
    if (parts.length < 3) continue
    const value = Number(parts[2])
    if (!Number.isFinite(value)) continue
    const from = decodeLabel(parts[0])
    const to = decodeLabel(parts[1])
    edges.push({ from, to, value })
    for (const node of [from, to]) {
      if (!totals.has(node)) {
        totals.set(node, 0)
        order.push(node)
      }
    }
    totals.set(from, (totals.get(from) ?? 0) + value)
    totals.set(to, (totals.get(to) ?? 0) + value)
  }
  const maxNode = Math.max(1, ...totals.values())
  const maxEdge = Math.max(1, ...edges.map((edge) => edge.value))
  const barWidth = clamp(options.width - 24, 8, 46)
  const height = 2 + totals.size + 1 + 1 + edges.length + 1
  const canvas = new Canvas(options.width, height)
  canvas.text(0, 0, "nodes", "text")
  let y = 2
  for (const node of order) {
    const total = totals.get(node) ?? 0
    const length = Math.round((total / maxNode) * barWidth)
    canvas.text(0, y, padEnd(truncate(node, 14), 14), "text")
    canvas.text(15, y, "\u2588".repeat(Math.max(1, length)), "accent")
    canvas.text(16 + barWidth, y, String(total), "dim")
    y += 1
  }
  y += 1
  canvas.text(0, y, "flows", "text")
  y += 1
  for (const edge of edges) {
    const length = Math.max(1, Math.round((edge.value / maxEdge) * 10))
    canvas.text(0, y, truncate(edge.from, 12), "accent2")
    const arrow = ` \u2500${"\u2500".repeat(length)}\u25b6 `
    canvas.text(13, y, arrow, "muted")
    canvas.text(13 + textWidth(arrow), y, truncate(edge.to, 12), "accent2")
    canvas.text(options.width - 5, y, String(edge.value), "dim")
    y += 1
  }
  return canvas
}

/* --------------------------------------------------------------- packet --- */

function renderPacket(source: string, options: RenderOptions): Canvas {
  const lines = sourceLines(source)
  const fields: { start: number; end: number; label: string }[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("%%") || /^packet-beta/i.test(line)) continue
    const match = line.match(/^(\d+)\s*(?:-\s*(\d+))?\s*:\s*(.*)$/)
    if (!match) continue
    const start = Number(match[1])
    const end = match[2] === undefined ? start : Number(match[2])
    const label = decodeLabel(match[3])
    fields.push({ start, end: Math.max(start, end), label })
  }
  const totalBits = fields.reduce((max, field) => Math.max(max, field.end + 1), 32)
  const rows: { start: number; end: number; label: string }[][] = []
  let current: { start: number; end: number; label: string }[] = []
  let currentWidth = 0
  const budget = options.width
  for (const field of fields) {
    const bits = field.end - field.start + 1
    const width = clamp(Math.round((bits / totalBits) * budget), 6, Math.max(6, Math.round(budget / 2)))
    if (current.length > 0 && currentWidth + width > budget) {
      rows.push(current)
      current = []
      currentWidth = 0
    }
    current.push({ ...field, end: field.end })
    currentWidth += width + 1
  }
  if (current.length) rows.push(current)
  const rowHeight = 3
  const height = (titleOf(lines) ? 2 : 0) + rows.length * (rowHeight + 1)
  const canvas = new Canvas(options.width, height)
  let y = 0
  const title = titleOf(lines)
  if (title) {
    canvas.text(0, y, truncate(title, options.width), "text")
    y += 2
  }
  for (const row of rows) {
    let x = 0
    for (const field of row) {
      const bits = field.end - field.start + 1
      let width = clamp(Math.round((bits / totalBits) * budget), 6, Math.max(6, Math.round(budget / 2)))
      width = Math.min(width, options.width - x - 1)
      if (width < 3) break
      canvas.box(x, y, width + 1, rowHeight, { style: "border", round: true, title: field.label })
      const range = field.start === field.end ? `${field.start}` : `${field.start}-${field.end}`
      canvas.text(x + 2, y + 1, truncate(range, width - 2), "dim")
      x += width + 2
    }
    y += rowHeight + 1
  }
  if (fields.length === 0) canvas.text(0, 0, "packet-beta (no fields parsed)", "muted")
  return canvas
}

/* ------------------------------------------------------------------ export - */

export const charts: Family[] = [
  { name: "pie", match: (s) => /^\s*pie\b/i.test(firstMeaningfulLine(s)), render: renderPie },
  {
    name: "xychart",
    match: (s) => /^\s*xychart/i.test(firstMeaningfulLine(s)),
    render: renderXyChart,
  },
  {
    name: "radar",
    match: (s) => /^\s*radar-beta/i.test(firstMeaningfulLine(s)),
    render: renderRadar,
  },
  {
    name: "quadrant",
    match: (s) => /^\s*quadrantChart/i.test(firstMeaningfulLine(s)),
    render: renderQuadrant,
  },
  {
    name: "sankey",
    match: (s) => /^\s*sankey-beta/i.test(firstMeaningfulLine(s)),
    render: renderSankey,
  },
  {
    name: "packet",
    match: (s) => /^\s*packet(-beta)?\b/i.test(firstMeaningfulLine(s)),
    render: renderPacket,
  },
]
