import { Canvas, type StyleName } from "../core/canvas.js"
import { padEnd, textWidth, truncate, wrapText } from "../core/text.js"
import type { Family, RenderOptions } from "./types.js"
import { clamp, decodeLabel, firstMeaningfulLine, sourceLines } from "./util.js"

/* -------------------------------------------------------------- journey --- */

function renderJourney(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const title = raw.map((line) => line.trim()).find((line) => /^title\b/i.test(line))
  const steps: { kind: "section" | "task"; label: string; score?: number; actor?: string }[] = []
  for (const rawLine of raw) {
    const line = rawLine.trim()
    if (!line || line.startsWith("%%") || /^journey\b/i.test(line) || /^title\b/i.test(line)) continue
    const section = line.match(/^section\s+(.*)$/i)
    if (section) {
      steps.push({ kind: "section", label: decodeLabel(section[1]) })
      continue
    }
    const task = line.match(/^(.+?)\s*:\s*([0-9]+)\s*(?::\s*(.*))?$/)
    if (task) steps.push({ kind: "task", label: decodeLabel(task[1]), score: clamp(Number(task[2]), 0, 5), actor: task[3] ? decodeLabel(task[3]) : undefined })
  }
  const labelWidth = clamp(Math.max(6, ...steps.map((step) => textWidth(step.label))), 6, Math.max(8, Math.floor(options.width * 0.4)))
  const height = (title ? 2 : 0) + steps.length + 1
  const canvas = new Canvas(options.width, height)
  let y = 0
  if (title) {
    canvas.text(0, y, truncate(title.replace(/^title\s+/i, ""), options.width), "text")
    y += 2
  }
  for (const step of steps) {
    if (step.kind === "section") {
      canvas.text(0, y, `\u258c ${truncate(step.label, options.width - 2)}`, "info")
      y += 1
      continue
    }
    const meter = Array.from({ length: 5 }, (_, index) => (index < (step.score ?? 0) ? "\u2588" : "\u2591")).join("")
    canvas.text(2, y, padEnd(truncate(step.label, labelWidth), labelWidth), "text")
    canvas.text(3 + labelWidth, y, meter, (step.score ?? 0) >= 4 ? "ok" : (step.score ?? 0) >= 3 ? "warn" : "accent2")
    canvas.text(4 + labelWidth + 5, y, String(step.score ?? 0), "dim")
    if (step.actor) canvas.text(6 + labelWidth + 5, y, truncate(step.actor, Math.max(0, options.width - labelWidth - 12)), "muted")
    y += 1
  }
  return canvas
}

/* --------------------------------------------------------------- mindmap --- */

function stripShape(value: string): string {
  let trimmed = value.trim()
  // Mindmap nodes can be `id((text))`, `id[text]`, `id(text)`, `id{{text}}`.
  const idPrefix = trimmed.match(/^[\w-]+\s*(?=\(\(|\[|\(|\{\{)/)
  if (idPrefix) trimmed = trimmed.slice(idPrefix[0].length).trim()
  const patterns = [
    /^\(\((.*)\)\)$/,
    /^\{\{(.*)\}\}$/,
    /^\[(.*)\]$/,
    /^\((.*)\)$/,
    /^"(.*)"$/,
  ]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match) return decodeLabel(match[1])
  }
  return decodeLabel(trimmed)
}

function renderMindmap(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const nodes: { indent: number; label: string }[] = []
  for (const rawLine of raw) {
    if (!rawLine.trim() || rawLine.trim().startsWith("%%") || /^mindmap\b/i.test(rawLine.trim())) continue
    const expanded = rawLine.replace(/\t/g, "  ")
    const indent = expanded.length - expanded.replace(/^ +/, "").length
    nodes.push({ indent, label: stripShape(expanded.trim()) })
  }
  const lines: string[] = []
  const levels = [...new Set(nodes.map((node) => node.indent))].sort((a, b) => a - b)
  const rootIndent = levels[0] ?? 0
  const walk = (index: number, prefix: string, isLast: boolean, isRoot: boolean): number => {
    const node = nodes[index]
    if (isRoot) lines.push(node.label)
    else lines.push(`${prefix}${isLast ? "\u2514\u2500 " : "\u251c\u2500 "}${node.label}`)
    const childPrefix = isRoot ? "" : prefix + (isLast ? "   " : "\u2502  ")
    let cursor = index + 1
    while (cursor < nodes.length && nodes[cursor].indent > node.indent) {
      let next = cursor + 1
      while (next < nodes.length && nodes[next].indent > nodes[cursor].indent) next += 1
      walk(cursor, childPrefix, next >= nodes.length || nodes[next].indent <= node.indent, false)
      cursor = next
    }
    return cursor
  }
  let cursor = 0
  if (nodes.length) cursor = walk(0, "", true, true)
  void rootIndent
  const height = lines.length + 1
  const canvas = new Canvas(options.width, height)
  lines.forEach((line, index) => {
    const style: StyleName = index === 0 ? "accent" : index % 2 === 0 ? "text" : "muted"
    canvas.text(0, index, truncate(line, options.width), style)
  })
  if (!lines.length) canvas.text(0, 0, "mindmap (empty)", "muted")
  return canvas
}

/* --------------------------------------------------------------- zenuml --- */

function renderZenuml(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const titleMatch = raw.map((line) => line.trim()).find((line) => /^title\b/i.test(line))
  const participants: string[] = []
  const messages: { from: string; to: string; text: string; dashed: boolean; self: boolean }[] = []
  const control: string[] = []
  const seen = (name: string) => {
    if (!participants.includes(name)) participants.push(name)
  }
  for (const rawLine of raw) {
    const line = rawLine.trim()
    if (!line || line.startsWith("%%") || /^zenuml\b/i.test(line) || /^title\b/i.test(line)) continue
    const actor = line.match(/^@(Actor|Database|Boundary|Control|Entity)\s+([\w-]+)/)
    if (actor) {
      seen(actor[2])
      continue
    }
    const message = line.match(/^([\w.-]+?)\s*(-{1,2}>|={1,2}>|\.{1,2}>)\s*([\w.-]+)\s*:\s*(.*)$/)
    if (message) {
      const from = message[1]
      const to = message[3]
      seen(from)
      seen(to)
      messages.push({
        from,
        to,
        text: decodeLabel(message[4]),
        dashed: message[2].startsWith("--") || message[2].startsWith(".."),
        self: from === to,
      })
      continue
    }
    if (/^(if|else|elseif|opt|loop|par|alt|try|catch|finally|end|return|while)\b/i.test(line))
      control.push(line)
  }
  const labelWidth = clamp(Math.max(6, ...participants.map((name) => textWidth(name))), 6, Math.max(8, Math.floor(options.width * 0.3)))
  const height = (titleMatch ? 2 : 0) + participants.length + 1 + messages.length + (control.length ? control.length + 1 : 0) + 1
  const canvas = new Canvas(options.width, height)
  let y = 0
  if (titleMatch) {
    canvas.text(0, y, truncate(titleMatch.replace(/^title\s+/i, ""), options.width), "text")
    y += 2
  }
  canvas.text(0, y, "participants", "muted")
  y += 1
  for (const participant of participants) {
    canvas.text(2, y, `\u25a1 ${participant}`, "accent")
    y += 1
  }
  y += 1
  canvas.text(0, y, "messages", "muted")
  y += 1
  for (const message of messages) {
    const arrow = message.self ? "\u21bb" : message.dashed ? "\u21e2" : "\u2192"
    const prefix = padEnd(truncate(message.from, labelWidth), labelWidth)
    const suffix = truncate(message.to, Math.max(2, options.width - labelWidth - 6))
    canvas.text(2, y, prefix, "accent2")
    canvas.text(3 + labelWidth, y, arrow, "muted")
    canvas.text(5 + labelWidth, y, suffix, "accent2")
    canvas.text(6 + labelWidth + textWidth(suffix), y, ` ${truncate(message.text, Math.max(0, options.width - labelWidth - 10))}`, "text")
    y += 1
  }
  if (control.length) {
    y += 1
    canvas.text(0, y, "control flow", "muted")
    y += 1
    for (const entry of control) {
      canvas.text(2, y, `\u25b8 ${truncate(entry, options.width - 4)}`, "dim")
      y += 1
    }
  }
  return canvas
}

/* ---------------------------------------------------------------- kanban --- */

function renderKanban(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const columns: { title: string; cards: string[] }[] = []
  for (const rawLine of raw) {
    const line = rawLine.trim()
    if (!line || line.startsWith("%%") || /^kanban\b/i.test(line)) continue
    if (/^(title|columnId|ticket)\b/i.test(line)) continue
    const card = line.match(/^\[(.*)\]$/)
    if (card) {
      if (columns.length === 0) columns.push({ title: "TODO", cards: [] })
      columns[columns.length - 1].cards.push(decodeLabel(card[1]))
      continue
    }
    columns.push({ title: decodeLabel(line), cards: [] })
  }
  if (!columns.length) {
    const canvas = new Canvas(options.width, 1)
    canvas.text(0, 0, "kanban (empty)", "muted")
    return canvas
  }
  const columnWidth = Math.max(
    12,
    Math.min(
      options.width,
      Math.max(...columns.map((column) => Math.max(textWidth(column.title) + 4, ...column.cards.map((card) => textWidth(card) + 4)))),
    ),
  )
  const heightOf = (column: { cards: string[] }) => column.cards.reduce((sum, card) => sum + wrapText(card, columnWidth - 4).length, 0) + 2
  const perRow = Math.max(1, Math.floor((options.width + 1) / (columnWidth + 1)))
  const rows: typeof columns[] = []
  for (let index = 0; index < columns.length; index += perRow) rows.push(columns.slice(index, index + perRow))
  let totalHeight = 0
  for (const row of rows) totalHeight += Math.max(...row.map(heightOf)) + 1
  const canvas = new Canvas(options.width, totalHeight + 1)
  let y = 0
  for (const row of rows) {
    const rowHeight = Math.max(...row.map(heightOf))
    row.forEach((column, index) => {
      const x = index * (columnWidth + 1)
      canvas.box(x, y, columnWidth, rowHeight, { style: "border", round: true, title: truncate(column.title, columnWidth - 4), titleStyle: "info" })
      let cardY = y + 1
      for (const card of column.cards) {
        for (const piece of wrapText(card, columnWidth - 4)) {
          canvas.text(x + 2, cardY, truncate(piece, columnWidth - 4), "text")
          cardY += 1
        }
      }
    })
    y += rowHeight + 1
  }
  return canvas
}

/* ---------------------------------------------------------------- export --- */

export const flows: Family[] = [
  { name: "journey", match: (s) => /^\s*journey\b/i.test(firstMeaningfulLine(s)), render: renderJourney },
  { name: "mindmap", match: (s) => /^\s*mindmap\b/i.test(firstMeaningfulLine(s)), render: renderMindmap },
  { name: "zenuml", match: (s) => /^\s*zenuml\b/i.test(firstMeaningfulLine(s)), render: renderZenuml },
  { name: "kanban", match: (s) => /^\s*kanban\b/i.test(firstMeaningfulLine(s)), render: renderKanban },
]
