import type { SceneState } from '@the-path/types'

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
