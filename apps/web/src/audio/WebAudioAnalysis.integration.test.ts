import { describe, expect, it, vi } from 'vitest'
import { WebAudioAnalysis } from './WebAudioAnalysis'
import { World } from '../world'
import { DEFAULT_TRACK_ID, getTrackById } from '../assets/tracks'

const createWorld = () => new World({ seed: 'test', width: 800, height: 600 })

const FALLBACK_TRACK = {
  id: 'fixture-track',
  title: 'Fixture Track',
  artist: 'Test Harness',
  duration: 4,
  bpm: 120,
  src: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=',
}

describe('WebAudioAnalysis integration', () => {
  it('keeps beat listeners active for uploaded tracks', async () => {
    const analysis = new WebAudioAnalysis()
    const world = createWorld()
    const syncSpy = vi.spyOn(world, 'syncToBeat')

    analysis.onBeat(({ time, confidence }) => {
      world.syncToBeat(time, confidence)
    })

    const builtinTrack = getTrackById(DEFAULT_TRACK_ID) ?? FALLBACK_TRACK
    expect(builtinTrack).toBeDefined()

    await analysis.load({
      ...builtinTrack,
      id: 'builtin-test',
    })

    ;(analysis as unknown as { emitBeat: (event: { time: number; confidence: number }) => void }).emitBeat({
      time: 1,
      confidence: 1,
    })
    expect(syncSpy).toHaveBeenLastCalledWith(1, 1)

    await analysis.load({
      id: 'custom',
      title: 'Uploaded',
      artist: 'User',
      duration: 12,
      bpm: 128,
    })

    ;(analysis as unknown as { emitBeat: (event: { time: number; confidence: number }) => void }).emitBeat({
      time: 2,
      confidence: 0.75,
    })
    expect(syncSpy).toHaveBeenLastCalledWith(2, 0.75)

    syncSpy.mockRestore()
    analysis.destroy()
  })
})
