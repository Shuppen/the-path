import type { SceneState, Vector2, ViewportMetrics } from '@the-path/types'

export const getViewportMetrics = (
  canvas: HTMLCanvasElement,
  devicePixelRatio: number = globalThis.devicePixelRatio ?? 1
): ViewportMetrics => ({
  width: canvas.clientWidth,
  height: canvas.clientHeight,
  devicePixelRatio,
})

export const resizeCanvasToDisplaySize = (
  canvas: HTMLCanvasElement,
  metrics: ViewportMetrics
): void => {
  const width = Math.max(1, Math.floor(metrics.width * metrics.devicePixelRatio))
  const height = Math.max(1, Math.floor(metrics.height * metrics.devicePixelRatio))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

export const toCanvasCoordinates = (
  event: PointerEvent,
  metrics: ViewportMetrics
): Vector2 => {
  const target = event.currentTarget as Element | null
  const rect = target?.getBoundingClientRect()

  if (!rect) {
    return { x: 0, y: 0 }
  }

  return {
    x: (event.clientX - rect.left) * metrics.devicePixelRatio,
    y: (event.clientY - rect.top) * metrics.devicePixelRatio,
  }
}

export type AnimationStep = (state: SceneState) => void

export const createAnimationLoop = (step: AnimationStep): (() => void) => {
  let rafId = 0

  const loop = (timestamp: number): void => {
    step({ timestamp })
    rafId = requestAnimationFrame(loop)
  }

  rafId = requestAnimationFrame(loop)

  return () => cancelAnimationFrame(rafId)
}
