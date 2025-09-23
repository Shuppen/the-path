import { clamp, FIXED_DELTA, MAX_FIXED_STEPS } from '../core/time'

export type FixedUpdate = (dt: number) => void

export const createFixedTimestepper = (
  update: FixedUpdate,
  dt: number = FIXED_DELTA,
  maxSteps: number = MAX_FIXED_STEPS
): ((delta: number) => number) => {
  let accumulator = 0

  return (delta: number) => {
    accumulator += delta

    const maxAccumulated = dt * maxSteps
    accumulator = clamp(accumulator, 0, maxAccumulated)

    let steps = 0
    while (accumulator >= dt && steps < maxSteps) {
      update(dt)
      accumulator -= dt
      steps += 1
    }

    return accumulator / dt
  }
}
