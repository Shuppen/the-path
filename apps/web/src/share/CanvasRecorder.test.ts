import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import CanvasRecorder, { type RecorderState } from './CanvasRecorder'

type MutableGlobal = Omit<typeof globalThis, 'MediaRecorder' | 'MediaStream'> & {
  MediaRecorder?: typeof MediaRecorder
  MediaStream?: typeof MediaStream
}

const mutableGlobal = globalThis as MutableGlobal
const originalMediaRecorder = mutableGlobal.MediaRecorder
const originalMediaStream = mutableGlobal.MediaStream
const hadMediaRecorder = Object.prototype.hasOwnProperty.call(globalThis, 'MediaRecorder')
const hadMediaStream = Object.prototype.hasOwnProperty.call(globalThis, 'MediaStream')

class FakeMediaStream {
  private readonly tracks: MediaStreamTrack[]

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks]
  }

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track)
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks]
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio')
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'video')
  }
}

class FakeMediaRecorder {
  static lastInstance: FakeMediaRecorder | null = null
  static isTypeSupported(): boolean {
    return true
  }

  public state: 'inactive' | 'recording' | 'paused' = 'inactive'
  public ondataavailable: ((event: BlobEvent) => void) | null = null
  public onerror: ((event: { error: Error }) => void) | null = null
  public onstop: (() => void) | null = null

  constructor(public readonly stream: MediaStream, public readonly options?: MediaRecorderOptions) {
    FakeMediaRecorder.lastInstance = this
  }

  start(): void {
    this.state = 'recording'
  }

  stop(): void {
    this.state = 'inactive'
    this.onstop?.()
  }

  emitChunk(data?: Blob): void {
    if (!this.ondataavailable) return
    const blob = data ?? new Blob(['chunk'], { type: 'video/webm' })
    this.ondataavailable({ data: blob } as BlobEvent)
  }

  fail(error: Error): void {
    this.onerror?.({ error })
  }
}

const createTrack = (kind: 'audio' | 'video'): MediaStreamTrack => ({
  kind,
  stop: vi.fn(),
} as unknown as MediaStreamTrack)

describe('CanvasRecorder', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mutableGlobal.MediaStream = FakeMediaStream as unknown as typeof MediaStream
    mutableGlobal.MediaRecorder = FakeMediaRecorder as unknown as typeof MediaRecorder
  })

  afterEach(() => {
    if (hadMediaStream) {
      mutableGlobal.MediaStream = originalMediaStream
    } else {
      Reflect.deleteProperty(mutableGlobal, 'MediaStream')
    }
    if (hadMediaRecorder) {
      mutableGlobal.MediaRecorder = originalMediaRecorder
    } else {
      Reflect.deleteProperty(mutableGlobal, 'MediaRecorder')
    }
  })

  it('transitions between idle and recording states', () => {
    const canvas = document.createElement('canvas') as HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream
    }
    const stream = new FakeMediaStream([createTrack('video')]) as unknown as MediaStream
    canvas.captureStream = vi.fn(() => stream)

    const recorder = new CanvasRecorder(canvas, { bufferDuration: 5, chunkInterval: 50 })
    const states: RecorderState[] = []
    recorder.onStateChange((state) => {
      states.push(state)
    })

    expect(recorder.start()).toBe(true)
    expect(recorder.getState()).toBe('recording')
    expect(states).toContain('recording')

    recorder.stop()
    expect(recorder.getState()).toBe('idle')
    expect(states).toContain('idle')
    recorder.destroy()
  })

  it('enters error state when captureStream is unavailable', () => {
    const canvas = document.createElement('canvas')
    const recorder = new CanvasRecorder(canvas as HTMLCanvasElement, { bufferDuration: 5 })
    const states: RecorderState[] = []
    recorder.onStateChange((state) => {
      states.push(state)
    })

    expect(recorder.start()).toBe(false)
    expect(recorder.getState()).toBe('error')
    expect(states.at(-1)).toBe('error')
    recorder.destroy()
  })
})
