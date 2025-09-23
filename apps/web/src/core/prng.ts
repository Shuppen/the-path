export interface Prng {
  next(): number
  nextRange(min: number, max: number): number
  nextInt(max: number): number
  pick<T>(values: readonly T[]): T
}

const UINT32_MAX = 0xffffffff

const xmur3 = (str: string): (() => number) => {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

const mulberry32 = (seed: number): (() => number) => {
  let a = seed
  return () => {
    a += 0x6d2b79f5
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / (UINT32_MAX + 1)
  }
}

export const createPrng = (seed: string): Prng => {
  const seedFn = xmur3(seed)
  const generator = mulberry32(seedFn())

  return {
    next: () => generator(),
    nextRange: (min: number, max: number) => generator() * (max - min) + min,
    nextInt: (max: number) => Math.floor(generator() * max),
    pick: <T>(values: readonly T[]): T => {
      if (values.length === 0) {
        throw new Error('Cannot pick from an empty array')
      }
      const index = Math.floor(generator() * values.length)
      return values[index]
    },
  }
}

export const createSeed = (source?: string): string => {
  if (source && source.trim().length > 0) {
    return source.trim()
  }

  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buffer = new Uint32Array(2)
    crypto.getRandomValues(buffer)
    return Array.from(buffer)
      .map((value) => value.toString(16).padStart(8, '0'))
      .join('')
  }

  return Math.floor(Math.random() * UINT32_MAX)
    .toString(16)
    .padStart(8, '0')
}
