const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const deepMerge = <T>(base: T, patch: Partial<T> | null | undefined): T => {
  if (!patch) {
    if (Array.isArray(base)) {
      return ([...base] as unknown) as T
    }
    if (isPlainObject(base)) {
      return { ...(base as Record<string, unknown>) } as T
    }
    return base
  }

  const apply = (target: unknown, source: unknown): unknown => {
    if (Array.isArray(source)) {
      return source.map((entry) => (isPlainObject(entry) ? apply({}, entry) : entry))
    }
    if (isPlainObject(source)) {
      const accumulator: Record<string, unknown> = {}
      const targetObject = isPlainObject(target) ? target : {}
      for (const key of Object.keys(source)) {
        const nextValue = (source as Record<string, unknown>)[key]
        if (nextValue === undefined) continue
        const previousValue = targetObject[key]
        accumulator[key] = apply(previousValue, nextValue)
      }
      for (const key of Object.keys(targetObject)) {
        if (!(key in accumulator)) {
          accumulator[key] = targetObject[key]
        }
      }
      return accumulator
    }
    return source
  }

  return apply(base as unknown, patch as unknown) as T
}

export default deepMerge
