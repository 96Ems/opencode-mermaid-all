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

interface Job {
  renderable: Animatable
  base: Grid
  motions: Motion[]
  palette: DiagramPalette
  startedAt: number
  stopped: boolean
  errors: number
}

/**
 * All animated diagrams share one timer so a screen full of diagrams costs a
 * single render pass per frame instead of one per diagram.
 */
const jobs = new Set<Job>()
let timer: ReturnType<typeof setInterval> | undefined
let intervalMs = 100
let speed = 1

function removeJob(job: Job): void {
  job.stopped = true
  jobs.delete(job)
  if (jobs.size === 0 && timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

function onFrame(): void {
  const now = Date.now()
  for (const job of [...jobs]) {
    if (job.stopped) continue
    try {
      const time = ((now - job.startedAt) / 1000) * speed
      const frame = job.base.clone()
      applyMotions(frame, job.motions, time, job.palette)
      job.renderable.content = frame.toStyledText()
      job.renderable.requestRender()
      job.errors = 0
    } catch {
      job.errors += 1
      if (job.errors >= STOP_AFTER_ERRORS) removeJob(job)
    }
  }
  if (jobs.size === 0 && timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

/**
 * Animate a rendered diagram in place by re-emitting its styled content on a
 * throttled shared timer. We deliberately do not set `live = true`: a plain
 * `requestRender()` schedules a single frame, so an idle TUI stays idle.
 */
export function animateGrid(
  renderable: Animatable,
  base: Grid,
  palette: DiagramPalette,
  options: AnimationOptions = readAnimationOptions(),
  override?: Motion[],
): (() => void) | undefined {
  if (!options.enabled) return undefined
  if (base.w * base.h > MAX_ANIMATED_CELLS && !override) return undefined

  let motions: Motion[]
  try {
    motions = override && override.length > 0 ? override : collectMotions(base)
  } catch {
    return undefined
  }
  if (motions.length === 0) return undefined

  intervalMs = Math.max(33, Math.round(1000 / options.fps))
  speed = options.speed

  const job: Job = {
    renderable,
    base,
    motions,
    palette,
    startedAt: Date.now(),
    stopped: false,
    errors: 0,
  }
  jobs.add(job)

  if (timer === undefined) timer = setInterval(onFrame, intervalMs)

  const stop = () => removeJob(job)
  try {
    renderable.once(RenderableEvents.DESTROYED, stop)
  } catch {
    // The renderable may already be gone; the shared timer then drops the job.
  }
  return stop
}

/** Number of diagrams currently animating (used by tests). */
export function activeAnimationCount(): number {
  return jobs.size
}
