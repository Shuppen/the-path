import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_RECENT_TRACKS,
  RECENT_TRACKS_STORAGE_KEY,
  StoredRecentTrack,
  readRecentTracks,
  toManifest,
  upsertRecentTrack,
  writeRecentTracks,
} from './recentTracks'

let trackCounter = 0

const createTrack = (overrides: Partial<StoredRecentTrack> = {}): StoredRecentTrack => ({
  id: overrides.id ?? `track-${trackCounter++}`,
  title: overrides.title ?? 'Track',
  artist: overrides.artist ?? 'Artist',
  duration: overrides.duration ?? 120,
  bpm: overrides.bpm ?? 128,
  createdAt: overrides.createdAt ?? Date.now(),
})

const createMockStorage = (initial: Record<string, string | null> = {}) => {
  const store = new Map(Object.entries(initial))

  return {
    get length() {
      return store.size
    },
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
  } satisfies Storage
}

describe('recentTracks', () => {
  const now = 1_700_000_000_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('readRecentTracks', () => {
    it('returns an empty array when storage is unavailable', () => {
      expect(readRecentTracks(undefined)).toEqual([])
    })

    it('filters out malformed entries', () => {
      const storage = createMockStorage({
        [RECENT_TRACKS_STORAGE_KEY]: JSON.stringify([
          { id: 'valid', title: 'Valid', artist: 'Artist', duration: 120, bpm: 128, createdAt: now },
          { id: 'missingFields' },
          'not-an-object',
        ]),
      })

      const result = readRecentTracks(storage)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ id: 'valid' })
      expect(storage.getItem).toHaveBeenCalledWith(RECENT_TRACKS_STORAGE_KEY)
    })

    it('ignores broken JSON payloads', () => {
      const storage = createMockStorage({ [RECENT_TRACKS_STORAGE_KEY]: '{invalid json' })
      expect(readRecentTracks(storage)).toEqual([])
    })
  })

  describe('writeRecentTracks', () => {
    it('persists the provided payload when storage is available', () => {
      const storage = createMockStorage()
      const tracks = [createTrack({ id: 'one' }), createTrack({ id: 'two' })]

      writeRecentTracks(tracks, storage)

      expect(storage.setItem).toHaveBeenCalledTimes(1)
      expect(storage.setItem).toHaveBeenCalledWith(
        RECENT_TRACKS_STORAGE_KEY,
        JSON.stringify(tracks),
      )
    })
  })

  describe('upsertRecentTrack', () => {
    it('adds new entries and sorts them by recency', () => {
      const older = createTrack({ id: 'older', createdAt: now - 5000 })
      const newest = createTrack({ id: 'newest', createdAt: now })
      const middle = createTrack({ id: 'middle', createdAt: now - 2000 })

      const result = upsertRecentTrack([older, middle], newest)

      expect(result.map((track) => track.id)).toEqual(['newest', 'middle', 'older'])
    })

    it('deduplicates entries by id and keeps the latest timestamp', () => {
      const existing = createTrack({ id: 'duplicate', createdAt: now - 10_000 })
      const updated = createTrack({ id: 'duplicate', createdAt: now })

      const result = upsertRecentTrack([existing], updated)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(updated)
    })

    it('enforces the configured limit and tolerates invalid overrides', () => {
      const baseTracks = Array.from({ length: MAX_RECENT_TRACKS }, (_, index) =>
        createTrack({ id: `track-${index}`, createdAt: now - index * 1000 }),
      )

      const extra = createTrack({ id: 'extra', createdAt: now + 1000 })

      const limited = upsertRecentTrack(baseTracks, extra)
      const withInvalidLimit = upsertRecentTrack(baseTracks, extra, 0)

      expect(limited).toHaveLength(MAX_RECENT_TRACKS)
      expect(limited[0].id).toBe('extra')
      expect(withInvalidLimit).toHaveLength(1)
      expect(withInvalidLimit[0].id).toBe('extra')
    })
  })

  describe('toManifest', () => {
    it('maps stored tracks to manifest entries', () => {
      const track = createTrack({ id: 'manifest-id', bpm: 100, duration: 321 })
      const manifest = toManifest(track)

      expect(manifest).toEqual({
        id: 'manifest-id',
        title: track.title,
        artist: track.artist,
        duration: 321,
        bpm: 100,
      })
    })
  })
})
