import { RGBA } from "@opentui/core"
import { blendColor } from "../vendor/merman/core/color/style.js"
import type { StyleName } from "./core/canvas.js"

export interface DiagramPalette {
  text: RGBA
  muted: RGBA
  border: RGBA
  dim: RGBA
  accent: RGBA
  accent2: RGBA
  warn: RGBA
  ok: RGBA
  info: RGBA
}

const FALLBACK_TEXT = RGBA.fromInts(228, 239, 232, 255)
const FALLBACK_MUTED = RGBA.fromInts(140, 166, 156, 255)
const FALLBACK_ACCENT = RGBA.fromInts(134, 225, 200, 255)

function asRgba(value: unknown): RGBA | undefined {
  return value instanceof RGBA ? value : undefined
}

const FALLBACK_PALETTE: DiagramPalette = {
  text: FALLBACK_TEXT,
  muted: FALLBACK_MUTED,
  border: FALLBACK_MUTED,
  dim: FALLBACK_MUTED,
  accent: FALLBACK_ACCENT,
  accent2: FALLBACK_ACCENT,
  warn: FALLBACK_ACCENT,
  ok: FALLBACK_ACCENT,
  info: FALLBACK_ACCENT,
}

/**
 * Map whatever theme object the host hands a TUI plugin onto a small palette.
 * The runtime shape is not guaranteed (the public tokens differ from the
 * internal resolved theme), so every read is defensive and never throws.
 */
export function resolvePalette(theme: unknown, mode: "dark" | "light"): DiagramPalette {
  try {
    const tokens = (theme ?? {}) as {
      text?: Record<string, unknown>
      categorical?: unknown
    }
    const textTokens = tokens.text ?? {}
    const text =
      asRgba(textTokens["default"]) ??
      asRgba(textTokens["base"]) ??
      asRgba(textTokens["muted"]) ??
      FALLBACK_TEXT
    const subdued = asRgba(textTokens["subdued"]) ?? asRgba(textTokens["muted"]) ?? FALLBACK_MUTED
    const muted = blendColor(text, subdued, 0.45) ?? FALLBACK_MUTED
    const border = blendColor(text, subdued, 0.68) ?? FALLBACK_MUTED
    const dim = blendColor(text, subdued, 0.82) ?? FALLBACK_MUTED

    const categorical = Array.isArray(tokens.categorical) ? tokens.categorical : []
    const active = (entry: unknown): RGBA => {
      if (!entry || typeof entry !== "object") return FALLBACK_ACCENT
      const record = entry as Record<number, unknown>
      return (
        asRgba(record[mode === "dark" ? 300 : 700]) ??
        asRgba(record[mode === "dark" ? 200 : 800]) ??
        FALLBACK_ACCENT
      )
    }
    const feedback = (textTokens["feedback"] ?? {}) as Record<string, { default?: unknown } | undefined>
    const warn = asRgba(feedback.warning?.default) ?? asRgba(feedback.info?.default) ?? FALLBACK_ACCENT
    const ok = asRgba(feedback.success?.default) ?? FALLBACK_ACCENT
    const info = asRgba(feedback.info?.default) ?? FALLBACK_ACCENT

    return {
      text,
      muted,
      border,
      dim,
      accent: active(categorical[3] ?? categorical[0]),
      accent2: active(categorical[0] ?? categorical[3]),
      warn,
      ok,
      info,
    }
  } catch {
    return FALLBACK_PALETTE
  }
}

export function colorFor(palette: DiagramPalette, style: StyleName | undefined): RGBA | undefined {
  switch (style) {
    case "text":
      return palette.text
    case "muted":
      return palette.muted
    case "border":
      return palette.border
    case "dim":
      return palette.dim
    case "accent":
      return palette.accent
    case "accent2":
      return palette.accent2
    case "warn":
      return palette.warn
    case "ok":
      return palette.ok
    case "info":
      return palette.info
    default:
      return undefined
  }
}
