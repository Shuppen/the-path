import type { AudioTrackManifestEntry } from '../assets/tracks'

export interface StoredRecentTrack {
  id: string
  title: string
  artist: string
  duration: number
  bpm: number
  createdAt: number
}

export const RECENT_TRACKS_STORAGE_KEY = 'the-path:recent-tracks'
export const MAX_RECENT_TRACKS = 6

const getStorage = (storage?: Storage): Storage | null => {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isValidRecord = (value: unknown): value is StoredRecentTrack => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<StoredRecentTrack>
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.artist === 'string' &&
    isFiniteNumber(record.duration) &&
    isFiniteNumber(record.bpm) &&
    isFiniteNumber(record.createdAt)
  )
}

export const readRecentTracks = (storage?: Storage): StoredRecentTrack[] => {
  const target = getStorage(storage)
  if (!target) return []
  try {
    const raw = target.getItem(RECENT_TRACKS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidRecord)
  } catch {
    return []
  }
}

export const writeRecentTracks = (
  tracks: StoredRecentTrack[],
  storage?: Storage,
): void => {
  const target = getStorage(storage)
  if (!target) return
  try {
    target.setItem(RECENT_TRACKS_STORAGE_KEY, JSON.stringify(tracks))
  } catch {
    // ignore persistence errors
  }
}

export const upsertRecentTrack = (
  tracks: StoredRecentTrack[],
  entry: StoredRecentTrack,
  limit = MAX_RECENT_TRACKS,
): StoredRecentTrack[] => {
  const filtered = tracks.filter((track) => track.id !== entry.id)
  return [entry, ...filtered].slice(0, Math.max(1, limit))
}

export const toManifest = (entry: StoredRecentTrack): AudioTrackManifestEntry => ({
  id: entry.id,
  title: entry.title,
  artist: entry.artist,
  duration: entry.duration,
  bpm: entry.bpm,
})
