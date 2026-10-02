import { Canvas, type StyleName } from "../core/canvas.js"
import { padEnd, textWidth, truncate, wrapText } from "../core/text.js"
import type { Family, RenderOptions } from "./types.js"
import { clamp, decodeLabel, firstMeaningfulLine, sourceLines } from "./util.js"

interface Card {
  title: string
  meta?: string
  lines: string[]
  titleStyle?: StyleName
}

function cardInnerWidth(card: Card): number {
  return Math.max(
    textWidth(card.title) + 2,
    card.meta ? textWidth(card.meta) + 2 : 0,
    ...card.lines.map((line) => textWidth(line) + 2),
    8,
  )
}

function cardHeight(card: Card): number {
  return (card.meta ? 1 : 0) + card.lines.length + 2
}

function drawCard(canvas: Canvas, x: number, y: number, width: number, card: Card): void {
  const height = cardHeight(card)
  canvas.box(x, y, width, height, {
    style: "border",
    round: true,
    title: truncate(card.title, Math.max(1, width - 4)),
    titleStyle: card.titleStyle ?? "accent",
  })
  let row = y + 1
  if (card.meta) {
    canvas.text(x + 2, row, truncate(card.meta, width - 4), "muted")
    row += 1
  }
  for (const line of card.lines) {
    canvas.text(x + 2, row, truncate(line, width - 4), "text")
    row += 1
  }
}

function renderSections(cards: Card[], relations: string[], options: RenderOptions): Canvas {
  const widths = cards.map(cardInnerWidth)
  const cardWidth = clamp(Math.max(20, ...widths.map((value) => value + 2)), 20, options.width)
  let height = 0
  for (const card of cards) height += cardHeight(card) + 1
  if (relations.length) height += relations.length + 2
  const canvas = new Canvas(options.width, height)
  let y = 0
  for (const card of cards) {
    drawCard(canvas, 0, y, cardWidth, card)
    y += cardHeight(card) + 1
  }
  if (relations.length) {
    y += 1
    canvas.text(0, y, "relations", "muted")
    y += 1
    for (const relation of relations) {
      canvas.text(2, y, truncate(relation, options.width - 2), "dim")
      y += 1
    }
  }
  return canvas
}

/* --------------------------------------------------------------- class --- */

const CLASS_RELATION =
  /^([\w]+)\s+(?:"([^"]*)"\s+)?(<\|--|--\|>|\*--|o--|-->|<--|\.\.>|<\.\.|\.\.|--)\s+(?:"([^"]*)"\s+)?([\w]+)\s*(?::\s*(.*))?$/

function renderClass(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const cards: Card[] = []
  const byName = new Map<string, Card>()
  const relations: string[] = []
  let index = 0
  while (index < raw.length) {
    const line = raw[index].trim()
    const block = line.match(/^class\s+([\w-]+)\s*(?:\[([^\]]*)\])?\s*\{?/)
    if (block) {
      const name = block[1]
      const members: string[] = []
      if (line.includes("{")) {
        index += 1
        while (index < raw.length && !raw[index].trim().startsWith("}")) {
          const member = raw[index].trim()
          if (member) members.push(member)
          index += 1
        }
      }
      const card: Card = {
        title: block[2] ? `${name} \u00ab${block[2]}\u00bb` : name,
        lines: members,
        titleStyle: "accent",
      }
      cards.push(card)
      byName.set(name, card)
      index += 1
      continue
    }
    const member = line.match(/^([\w-]+)\s*:\s*(.*)$/)
    if (member && byName.has(member[1])) {
      byName.get(member[1])!.lines.push(decodeLabel(member[2]))
      index += 1
      continue
    }
    const rel = line.match(CLASS_RELATION)
    if (rel) {
      const cardinal = rel[2] || rel[4] ? ` (${[rel[2], rel[4]].filter(Boolean).join(",")})` : ""
      const label = rel[6] ? ` : ${decodeLabel(rel[6])}` : ""
      relations.push(`${rel[1]} ${rel[3]} ${rel[5]}${cardinal}${label}`)
    }
    index += 1
  }
  return renderSections(cards, relations, options)
}

/* ------------------------------------------------------------------ er --- */

const ER_RELATION = /^([\w-]+)\s+([|}o{<>-]+)\s+([\w-]+)\s*:\s*(.*)$/

function renderEr(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const cards: Card[] = []
  const relations: string[] = []
  let index = 0
  while (index < raw.length) {
    const line = raw[index].trim()
    const header = line.match(/^([\w-]+)\s*\{$/)
    if (header) {
      const attributes: string[] = []
      index += 1
      while (index < raw.length && !raw[index].trim().startsWith("}")) {
        const attribute = raw[index].trim()
        if (attribute) attributes.push(attribute)
        index += 1
      }
      cards.push({ title: header[1], lines: attributes, titleStyle: "accent" })
      index += 1
      continue
    }
    const standalone = line.match(/^([\w-]+)\s*$/)
    if (standalone && !["erDiagram"].includes(standalone[1])) {
      if (!cards.some((card) => card.title === standalone[1]))
        cards.push({ title: standalone[1], lines: [], titleStyle: "accent" })
      index += 1
      continue
    }
    const relation = line.match(ER_RELATION)
    if (relation) relations.push(`${relation[1]} ${relation[2]} ${relation[3]} : ${decodeLabel(relation[4])}`)
    index += 1
  }
  return renderSections(cards, relations, options)
}

/* --------------------------------------------------------- requirement --- */

const REQUIREMENT_KINDS = [
  "requirement",
  "functionalRequirement",
  "performanceRequirement",
  "interfaceRequirement",
  "physicalRequirement",
  "designConstraint",
  "element",
]

function renderRequirement(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const cards: Card[] = []
  const relations: string[] = []
  let index = 0
  while (index < raw.length) {
    const line = raw[index].trim()
    const header = line.match(/^(\w+)\s+([\w-]+)\s*\{$/)
    if (header && REQUIREMENT_KINDS.includes(header[1])) {
      const props: string[] = []
      index += 1
      while (index < raw.length && !raw[index].trim().startsWith("}")) {
        const prop = raw[index].trim()
        if (prop) props.push(prop.replace(/:\s*/, ": "))
        index += 1
      }
      cards.push({
        title: header[2],
        meta: `\u00ab${header[1]}\u00bb`,
        lines: props,
        titleStyle: "info",
      })
      index += 1
      continue
    }
    const relation = line.match(/^([\w-]+)\s+-\s+([\w-]+)\s+->\s+([\w-]+)/)
    if (relation) relations.push(`${relation[1]} -${relation[2]}-> ${relation[3]}`)
    index += 1
  }
  return renderSections(cards, relations, options)
}

/* ------------------------------------------------------------------ c4 --- */

function renderC4(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const cards: Card[] = []
  const relations: string[] = []
  for (const line of raw.map((value) => value.trim())) {
    if (!line || line.startsWith("%%")) continue
    const relation = line.match(/^(?:Bi)?Rel(?:_[A-Za-z]+)?\s*\(\s*([\w-]+)\s*,\s*([\w-]+)\s*,\s*"([^"]*)"/)
    if (relation) {
      relations.push(`${relation[1]} \u2192 ${relation[2]} : ${decodeLabel(relation[3])}`)
      continue
    }
    const element = line.match(
      /^(Person|System|System_Ext|SystemDb|SystemDb_Ext|Container|ContainerDb|Component|ComponentDb|Boundary|Enterprise|Deployment_Node)(?:_Ext)?\s*\(\s*([\w-]+)\s*,\s*"([^"]*)"\s*(?:,\s*"([^"]*)")?/,
    )
    if (element) {
      const kind = element[1].replace(/_Ext$/, "")
      cards.push({
        title: decodeLabel(element[3]),
        meta: `[${kind}] ${element[2]}`,
        lines: element[4] ? wrapText(decodeLabel(element[4]), Math.max(10, options.width - 6)) : [],
        titleStyle: "accent",
      })
    }
  }
  return renderSections(cards, relations, options)
}

/* --------------------------------------------------------------- block --- */

function renderBlock(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  let columns = 3
  const rows: string[][] = []
  const relations: string[] = []
  for (const rawLine of raw) {
    const line = rawLine.trim()
    if (!line || line.startsWith("%%") || /^block-beta/i.test(line)) continue
    const columnsMatch = line.match(/^columns\s+(\d+)/i)
    if (columnsMatch) {
      columns = Math.max(1, Number(columnsMatch[1]))
      continue
    }
    if (!line.includes("[") && /-+>|={2,}>|\.+>|-{2,}/.test(line)) {
      const edge =
        line.match(/^([\w-]+)\s*-+>\s*(?:\|([^|]*)\|\s*)?([\w-]+)/) ||
        line.match(/^([\w-]+)\s*-{2,}\s*([\w-]+)/)
      if (edge) {
        const label = edge[2] ? ` : ${decodeLabel(edge[2])}` : ""
        relations.push(`${edge[1]} \u2192 ${edge[3] ?? "?"}${label}`)
        continue
      }
    }
    const tokens: string[] = []
    const tokenRe = /([\w-]+)(?:\s*(?:\["([^"]*)"\]|\(([^)]*)\)|\[([^\]]*)\]))?(:(\d+))?/g
    let match: RegExpExecArray | null
    while ((match = tokenRe.exec(line)) !== null) {
      if (!match[1]) continue
      const label = match[2] ?? match[3] ?? match[4] ?? match[1]
      tokens.push(label)
    }
    if (tokens.length) rows.push(tokens)
  }
  const cells = rows.flat()
  const grid: string[][] = []
  for (let index = 0; index < cells.length; index += columns) grid.push(cells.slice(index, index + columns))
  const cellWidth = Math.max(8, Math.floor((options.width - (columns - 1)) / Math.max(1, columns)))
  const cellHeight = 3
  const height = grid.length * (cellHeight + 1) + (relations.length ? relations.length + 2 : 0) + 1
  const canvas = new Canvas(options.width, height)
  let y = 0
  for (const row of grid) {
    for (let column = 0; column < row.length; column += 1) {
      const x = column * (cellWidth + 1)
      canvas.box(x, y, cellWidth, cellHeight, { style: "border", round: true })
      canvas.text(x + 2, y + 1, truncate(row[column], cellWidth - 4), "text")
    }
    y += cellHeight + 1
  }
  if (relations.length) {
    canvas.text(0, y, "edges", "muted")
    y += 1
    for (const relation of relations) {
      canvas.text(2, y, truncate(relation, options.width - 2), "dim")
      y += 1
    }
  }
  return canvas
}

/* -------------------------------------------------------- architecture --- */

function renderArchitecture(source: string, options: RenderOptions): Canvas {
  const raw = sourceLines(source)
  const cards: Card[] = []
  const groups = new Map<string, Card>()
  const relations: string[] = []
  for (const rawLine of raw) {
    const line = rawLine.trim()
    if (!line || line.startsWith("%%") || /^architecture-beta/i.test(line)) continue
    const group = line.match(/^group\s+([\w-]+)(?:\(([^)]*)\))?\s*\[([^\]]*)\]/)
    if (group) {
      const card: Card = { title: decodeLabel(group[3]), meta: `group ${group[1]}`, lines: [], titleStyle: "info" }
      groups.set(group[1], card)
      cards.push(card)
      continue
    }
    const service = line.match(
      /^(service|junction)\s+([\w-]+)(?:\(([^)]*)\))?\s*\[([^\]]*)\](\s+in\s+([\w-]+))?/,
    )
    if (service) {
      const label = decodeLabel(service[4])
      const icon = service[3] ? `[${service[3]}] ` : ""
      const target = service[6] ? groups.get(service[6]) : undefined
      const entry = `${icon}${label}`
      if (target) target.lines.push(entry)
      else cards.push({ title: label, meta: `service ${service[2]}`, lines: [entry], titleStyle: "accent" })
      continue
    }
    const relation = line.match(/^([\w-]+)(?::[LRBT])?\s*--\s*(?:[LRBT]:)?([\w-]+)/)
    if (relation) relations.push(`${relation[1]} \u2192 ${relation[2]}`)
  }
  return renderSections(cards, relations, options)
}

/* ---------------------------------------------------------------- export --- */

export const boxes: Family[] = [
  {
    name: "classDiagram",
    match: (s) => /^\s*classDiagram/i.test(firstMeaningfulLine(s)),
    render: renderClass,
  },
  {
    name: "erDiagram",
    match: (s) => /^\s*erDiagram/i.test(firstMeaningfulLine(s)),
    render: renderEr,
  },
  {
    name: "requirement",
    match: (s) => /^\s*requirementDiagram/i.test(firstMeaningfulLine(s)),
    render: renderRequirement,
  },
  {
    name: "C4",
    match: (s) => /^\s*C4(Context|Container|Component|Dynamic|Deployment)/i.test(firstMeaningfulLine(s)),
    render: renderC4,
  },
  {
    name: "block",
    match: (s) => /^\s*block-beta/i.test(firstMeaningfulLine(s)),
    render: renderBlock,
  },
  {
    name: "architecture",
    match: (s) => /^\s*architecture-beta/i.test(firstMeaningfulLine(s)),
    render: renderArchitecture,
  },
]
