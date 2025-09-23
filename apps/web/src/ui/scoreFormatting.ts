export const padScore = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '000000'
  }
  const normalized = Math.floor(value)
  return Math.max(0, normalized).toString().padStart(6, '0')
}
