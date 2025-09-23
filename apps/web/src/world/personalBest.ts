const STORAGE_KEY = 'the-path/personal-best'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const getStorage = (): Storage | null => {
  try {
    if ('localStorage' in globalThis) {
      const storage = (globalThis as { localStorage?: Storage }).localStorage
      if (storage) {
        return storage
      }
    }
  } catch (error) {
    console.warn('Unable to access localStorage for personal best:', error)
  }
  return null
}

export interface PersonalBestRecord {
  score: number
  updatedAt: number
}

export const PERSONAL_BEST_STORAGE_KEY = STORAGE_KEY

const normalizeRecord = (record: Partial<PersonalBestRecord>): PersonalBestRecord => {
  const score = isFiniteNumber(record.score) ? Math.max(0, Math.floor(record.score)) : 0
  const updatedAt = isFiniteNumber(record.updatedAt) ? Math.max(0, Math.floor(record.updatedAt)) : 0
  return { score, updatedAt }
}

export const readPersonalBest = (): PersonalBestRecord => {
  const storage = getStorage()
  if (!storage) {
    return { score: 0, updatedAt: 0 }
  }

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return { score: 0, updatedAt: 0 }
    }
    const parsed = JSON.parse(raw) as Partial<PersonalBestRecord>
    return normalizeRecord(parsed)
  } catch (error) {
    console.warn('Failed to read personal best from storage:', error)
    return { score: 0, updatedAt: 0 }
  }
}

export const writePersonalBest = (record: PersonalBestRecord): void => {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeRecord(record)))
  } catch (error) {
    console.warn('Failed to persist personal best:', error)
  }
}

export const updatePersonalBest = (score: number): PersonalBestRecord => {
  const record = normalizeRecord({ score, updatedAt: Date.now() })
  writePersonalBest(record)
  return record
}
