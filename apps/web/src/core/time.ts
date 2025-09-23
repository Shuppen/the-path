export const FIXED_DELTA = 1 / 60
export const MAX_FIXED_STEPS = 5
export const MAX_FRAME_DELTA = 0.25

export const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}
