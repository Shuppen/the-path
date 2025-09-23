import { FIXED_DELTA, MAX_FRAME_DELTA } from '../core/time'
import { createFixedTimestepper } from './timestepper'

export interface LoopHandlers {
  update: (dt: number) => void
  render: (alpha: number) => void
}

export interface LoopOptions {
  fixedDelta?: number
  maxFrameDelta?: number
}

export interface LoopController {
  start(): void
  stop(): void
  isRunning(): boolean
}

export const createGameLoop = (
  handlers: LoopHandlers,
  options: LoopOptions = {}
): LoopController => {
  const fixedDelta = options.fixedDelta ?? FIXED_DELTA
  const maxFrameDelta = options.maxFrameDelta ?? MAX_FRAME_DELTA

  const stepper = createFixedTimestepper(handlers.update, fixedDelta)

  let lastTimestamp = performance.now()
  let rafId = 0
  let running = false

  const frame = (timestamp: number) => {
    if (!running) return

    const deltaMs = timestamp - lastTimestamp
    lastTimestamp = timestamp

    const deltaSeconds = Math.min(deltaMs / 1000, maxFrameDelta)
    const alpha = stepper(deltaSeconds)

    handlers.render(alpha)

    rafId = requestAnimationFrame(frame)
  }

  const start = () => {
    if (running) return
    running = true
    lastTimestamp = performance.now()
    rafId = requestAnimationFrame(frame)
  }

  const stop = () => {
    if (!running) return
    running = false
    cancelAnimationFrame(rafId)
  }

  return {
    start,
    stop,
    isRunning: () => running,
  }
}
