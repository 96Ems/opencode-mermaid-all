import { boxes } from "./boxes.js"
import { charts } from "./charts.js"
import { flows } from "./flows.js"
import type { Family } from "./types.js"

export const FAMILIES: Family[] = [...charts, ...boxes, ...flows]

export function findFamily(source: string): Family | undefined {
  return FAMILIES.find((family) => family.match(source))
}
