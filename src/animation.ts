import { RenderableEvents, type StyledText } from "@opentui/core"
import { Grid } from "./core/grid.js"
import { applyMotions, collectMotions, type Motion } from "./core/motion.js"
import type { DiagramPalette } from "./palette.js"

export interface AnimationOptions {
  enabled: boolean
  fps: number
  speed: number
}

export interface Animatable {
  content: StyledText
  requestRender(): void
  once(event: string, listener: () => void): unknown
  visible?: boolean
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

/**
 * Animation is on by default; it can be disabled or tuned without touching the
 * plugin:
 *   MERMAID_ALL_ANIMATE=0   disable entirely
 *   MERMAID_ALL_FPS=12      frames per second (2..30)
 *   MERMAID_ALL_SPEED=1.5   motion speed multiplier (0.1..5)
 */
export function readAnimationOptions(): AnimationOptions {
  const env = (typeof process !== "undefined" ? process.env : undefined) ?? {}
  const disabled = /^(0|false|off|no|none)$/i.test(env.MERMAID_ALL_ANIMATE ?? "")
  return {
    enabled: !disabled,
    fps: clamp(Number(env.MERMAID_ALL_FPS ?? "10"), 2, 30),
    speed: clamp(Number(env.MERMAID_ALL_SPEED ?? "1"), 0.1, 5),
  }
}

const MAX_ANIMATED_CELLS = 40_000
const STOP_AFTER_ERRORS = 4

/**
 * Animate a rendered diagram in place by re-emitting its styled content on a
 * throttled timer. We deliberately do not set `live = true`: a plain
 * `requestRender()` schedules a single frame, so an idle TUI stays idle.
 */
export function animateGrid(
  renderable: Animatable,
  base: Grid,
  palette: DiagramPalette,
  options: AnimationOptions = readAnimationOptions(),
): (() => void) | undefined {
  if (!options.enabled) return undefined
  if (base.w * base.h > MAX_ANIMATED_CELLS) return undefined

  let motions: Motion[]
  try {
    motions = collectMotions(base)
  } catch {
    return undefined
  }
  if (motions.length === 0) return undefined

  const interval = Math.max(33, Math.round(1000 / options.fps))
  const startedAt = Date.now()
  let stopped = false
  let errors = 0

  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }

  const timer = setInterval(() => {
    if (stopped) return
    try {
      const time = ((Date.now() - startedAt) / 1000) * options.speed
      const frame = base.clone()
      applyMotions(frame, motions, time, palette)
      renderable.content = frame.toStyledText()
      renderable.requestRender()
    } catch {
      errors += 1
      if (errors >= STOP_AFTER_ERRORS) stop()
    }
  }, interval)

  try {
    renderable.once(RenderableEvents.DESTROYED, stop)
  } catch {
    // The renderable may already be gone; the interval is harmless then.
  }
  return stop
}
