import { RenderableEvents, type StyledText } from "@opentui/core"
import { Grid } from "./core/grid.js"
import { applyMotionFrame, resolveMotionFrame, type Motion } from "./core/motion.js"
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
  screenY?: number
  height?: number
  ctx?: { height?: number }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

/**
 * Animation is on by default; it can be disabled or tuned without touching the
 * plugin:
 *   MERMAID_ALL_ANIMATE=0   disable entirely
 *   MERMAID_ALL_FPS=20      frames per second (2..30)
 *   MERMAID_ALL_SPEED=1.2   motion speed multiplier (0.1..2)
 */
export function readAnimationOptions(): AnimationOptions {
  const env = (typeof process !== "undefined" ? process.env : undefined) ?? {}
  const disabled = /^(0|false|off|no|none)$/i.test(env.MERMAID_ALL_ANIMATE ?? "")
  return {
    enabled: !disabled,
    fps: clamp(Number(env.MERMAID_ALL_FPS ?? "20"), 2, 30),
    speed: clamp(Number(env.MERMAID_ALL_SPEED ?? "1"), 0.1, 2),
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
  fps: number
  speed: number
  lastFrameKey: string
  stopped: boolean
  errors: number
}

/**
 * All animated diagrams share one timer so a screen full of diagrams costs a
 * single render pass per frame instead of one per diagram.
 */
const jobs = new Set<Job>()
let timer: ReturnType<typeof setInterval> | undefined
let intervalMs = 0

function syncTimer(): void {
  if (jobs.size === 0) {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    intervalMs = 0
    return
  }

  const nextInterval = Math.max(33, Math.round(1000 / Math.max(...[...jobs].map((job) => job.fps))))
  if (timer !== undefined && intervalMs === nextInterval) return
  if (timer !== undefined) clearInterval(timer)
  intervalMs = nextInterval
  timer = setInterval(onFrame, intervalMs)
}

function removeJob(job: Job): void {
  job.stopped = true
  jobs.delete(job)
  syncTimer()
}

function isVisible(job: Job): boolean {
  const renderable = job.renderable
  if (renderable.visible === false) return false

  const top = renderable.screenY
  const height = renderable.height
  const viewportHeight = renderable.ctx?.height
  if (top === undefined || height === undefined || viewportHeight === undefined) return true
  return top + height > 0 && top < viewportHeight
}

function onFrame(): void {
  const now = Date.now()
  for (const job of [...jobs]) {
    if (job.stopped) continue
    if (!isVisible(job)) continue
    try {
      const time = ((now - job.startedAt) / 1000) * job.speed
      const motionFrame = resolveMotionFrame(job.base, job.motions, time)
      if (motionFrame.key === job.lastFrameKey) continue
      job.lastFrameKey = motionFrame.key
      const frame = job.base.clone()
      applyMotionFrame(frame, motionFrame.markers, job.palette, motionFrame.highlights)
      job.renderable.content = frame.toStyledText()
      job.renderable.requestRender()
      job.errors = 0
    } catch {
      job.errors += 1
      if (job.errors >= STOP_AFTER_ERRORS) removeJob(job)
    }
  }
  syncTimer()
}

/**
 * Animate a rendered diagram in place by re-emitting its styled content on a
 * throttled shared timer. One dot advances at a bounded cells/second rate,
 * identical frames are skipped, and off-screen diagrams do no work. We do not
 * set `live = true`, so an idle TUI stays idle.
 */
export function animateGrid(
  renderable: Animatable,
  base: Grid,
  palette: DiagramPalette,
  motions: readonly Motion[],
  options: AnimationOptions = readAnimationOptions(),
): (() => void) | undefined {
  if (!options.enabled) return undefined
  if (base.w * base.h > MAX_ANIMATED_CELLS) return undefined
  if (motions.length === 0) return undefined

  const job: Job = {
    renderable,
    base,
    motions: [...motions],
    palette,
    startedAt: Date.now(),
    speed: options.speed,
    fps: options.fps,
    lastFrameKey: "",
    stopped: false,
    errors: 0,
  }
  jobs.add(job)
  syncTimer()

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
