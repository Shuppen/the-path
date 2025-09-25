import { CALIBRATION_LIMIT_MS } from './constants'
import type { CalibrationSettings, MetaProgressState } from './types'

const CALIBRATION_STORAGE_KEY = 'the-path/calibration'
const META_STORAGE_KEY = 'the-path/meta'

const getStorage = (): Storage | null => {
  try {
    if ('localStorage' in globalThis) {
      return (globalThis as { localStorage?: Storage }).localStorage ?? null
    }
  } catch (error) {
    console.warn('Unable to access localStorage:', error)
  }
  return null
}

const clampCalibration = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (value > CALIBRATION_LIMIT_MS) return CALIBRATION_LIMIT_MS
  if (value < -CALIBRATION_LIMIT_MS) return -CALIBRATION_LIMIT_MS
  return Math.round(value)
}

const normalizeCalibration = (settings: Partial<CalibrationSettings> | null | undefined): CalibrationSettings => ({
  inputOffsetMs: clampCalibration(settings?.inputOffsetMs ?? 0),
  audioOffsetMs: clampCalibration(settings?.audioOffsetMs ?? 0),
})

const normalizeMeta = (meta: Partial<MetaProgressState> | null | undefined): MetaProgressState => ({
  xp: Number.isFinite(meta?.xp) ? Math.max(0, Math.floor(meta!.xp!)) : 0,
  level: Number.isFinite(meta?.level) ? Math.max(1, Math.floor(meta!.level!)) : 1,
  unlockedTracks: Array.isArray(meta?.unlockedTracks)
    ? (meta!.unlockedTracks as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [],
  unlockedSkins: Array.isArray(meta?.unlockedSkins)
    ? (meta!.unlockedSkins as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [],
})

export const readCalibrationSettings = (): CalibrationSettings => {
  const storage = getStorage()
  if (!storage) return normalizeCalibration(null)
  try {
    const raw = storage.getItem(CALIBRATION_STORAGE_KEY)
    if (!raw) return normalizeCalibration(null)
    return normalizeCalibration(JSON.parse(raw) as Partial<CalibrationSettings>)
  } catch (error) {
    console.warn('Failed to read calibration settings:', error)
    return normalizeCalibration(null)
  }
}

export const writeCalibrationSettings = (settings: CalibrationSettings): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(normalizeCalibration(settings)))
  } catch (error) {
    console.warn('Failed to persist calibration settings:', error)
  }
}

export const readMetaProgress = (): MetaProgressState => {
  const storage = getStorage()
  if (!storage) return normalizeMeta(null)
  try {
    const raw = storage.getItem(META_STORAGE_KEY)
    if (!raw) return normalizeMeta(null)
    return normalizeMeta(JSON.parse(raw) as Partial<MetaProgressState>)
  } catch (error) {
    console.warn('Failed to read meta progress:', error)
    return normalizeMeta(null)
  }
}

export const writeMetaProgress = (meta: MetaProgressState): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(META_STORAGE_KEY, JSON.stringify(normalizeMeta(meta)))
  } catch (error) {
    console.warn('Failed to persist meta progress:', error)
  }
}
