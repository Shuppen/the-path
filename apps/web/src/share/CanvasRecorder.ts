export type RecorderState = 'idle' | 'recording' | 'error'

export interface RecorderBufferState {
  duration: number
  limit: number
}

export interface RecorderErrorEvent {
  error: Error
}

export interface CanvasRecorderOptions {
  bufferDuration?: number
  chunkInterval?: number
  preferredMimeType?: string
  audioStreamFactory?: () => { stream: MediaStream; cleanup: () => void } | null
}

type StateListener = (state: RecorderState) => void

type BufferListener = (state: RecorderBufferState) => void

type ErrorListener = (event: RecorderErrorEvent) => void

interface BufferedChunk {
  blob: Blob
  duration: number
}

const DEFAULT_BUFFER_DURATION = 20
const DEFAULT_CHUNK_INTERVAL = 1000

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const clampPositive = (value: number): number => {
  if (Number.isNaN(value) || value < 0) return 0
  return value
}

const resolveMimeType = (preferred?: string): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined

  const candidates = preferred
    ? [preferred]
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

  for (const candidate of candidates) {
    if (!candidate) continue
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate
    } else {
      return candidate
    }
  }

  return undefined
}

export class CanvasRecorder {
  private readonly canvas: HTMLCanvasElement
  private readonly bufferDuration: number
  private readonly chunkInterval: number
  private readonly audioStreamFactory?: () => { stream: MediaStream; cleanup: () => void } | null
  private readonly mimeType: string | undefined

  private readonly stateListeners = new Set<StateListener>()
  private readonly bufferListeners = new Set<BufferListener>()
  private readonly errorListeners = new Set<ErrorListener>()

  private readonly chunks: BufferedChunk[] = []

  private recorder: MediaRecorder | null = null
  private mediaStream: MediaStream | null = null
  private audioCleanup: (() => void) | null = null
  private lastTick = 0
  private bufferedDuration = 0
  private lastError: Error | null = null
  private state: RecorderState = 'idle'

  constructor(canvas: HTMLCanvasElement, options: CanvasRecorderOptions = {}) {
    this.canvas = canvas
    this.bufferDuration = options.bufferDuration ?? DEFAULT_BUFFER_DURATION
    this.chunkInterval = options.chunkInterval ?? DEFAULT_CHUNK_INTERVAL
    this.audioStreamFactory = options.audioStreamFactory
    this.mimeType = resolveMimeType(options.preferredMimeType)
  }

  isSupported(): boolean {
    if (typeof window === 'undefined') return false
    if (typeof MediaRecorder === 'undefined') return false
    if (typeof MediaStream === 'undefined') return false
    if (typeof this.canvas.captureStream !== 'function') return false
    return true
  }

  getState(): RecorderState {
    return this.state
  }

  getBufferDuration(): number {
    return this.bufferDuration
  }

  getBufferedTime(): number {
    return this.bufferedDuration
  }

  getLastError(): Error | null {
    return this.lastError
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  onBufferUpdate(listener: BufferListener): () => void {
    this.bufferListeners.add(listener)
    listener({ duration: this.bufferedDuration, limit: this.bufferDuration })
    return () => {
      this.bufferListeners.delete(listener)
    }
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener)
    if (this.lastError) {
      listener({ error: this.lastError })
    }
    return () => {
      this.errorListeners.delete(listener)
    }
  }

  start(): boolean {
    if (!this.isSupported()) {
      this.reportError(new Error('Recording is not supported in this environment'))
      return false
    }

    if (this.state === 'recording') {
      return true
    }

    const capture = this.canvas.captureStream?.(60)
    if (!capture) {
      this.reportError(new Error('Failed to capture canvas stream'))
      return false
    }

    const combined = new MediaStream()
    let audioHandle: { stream: MediaStream; cleanup: () => void } | null = null

    try {
      for (const track of capture.getTracks()) {
        combined.addTrack(track)
      }

      if (this.audioStreamFactory) {
        audioHandle = this.audioStreamFactory() ?? null
        if (audioHandle?.stream) {
          for (const track of audioHandle.stream.getAudioTracks()) {
            combined.addTrack(track)
          }
        }
      }

      if (combined.getTracks().length === 0) {
        throw new Error('No media tracks available for recording')
      }

      const recorderOptions = this.mimeType ? { mimeType: this.mimeType } : undefined
      const recorder = new MediaRecorder(combined, recorderOptions)
      this.recorder = recorder
      this.mediaStream = combined
      this.audioCleanup = audioHandle?.cleanup ?? null
      this.resetBuffer()
      this.lastTick = now()

      recorder.ondataavailable = (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) {
          return
        }
        this.pushChunk(event.data)
      }

      recorder.onerror = (event: { error: Error }) => {
        const error = event.error ?? new Error('Unknown recorder error')
        this.reportError(error)
        this.stop()
      }

      recorder.onstop = () => {
        this.cleanupStream()
        this.setState('idle')
      }

      try {
        recorder.start(this.chunkInterval)
      } catch (error) {
        this.reportError(error instanceof Error ? error : new Error(String(error)))
        this.cleanupStream()
        return false
      }

      this.setState('recording')
      return true
    } catch (error) {
      if (audioHandle?.cleanup) {
        audioHandle.cleanup()
      }
      for (const track of combined.getTracks()) {
        try {
          track.stop()
        } catch {
          // ignore track stop errors
        }
      }
      this.cleanupStream()
      this.reportError(error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  stop(): void {
    if (this.recorder && this.recorder.state === 'recording') {
      try {
        this.recorder.stop()
      } catch (error) {
        this.reportError(error instanceof Error ? error : new Error(String(error)))
      }
    } else {
      this.cleanupStream()
      this.setState('idle')
    }
  }

  destroy(): void {
    this.stop()
    this.stateListeners.clear()
    this.bufferListeners.clear()
    this.errorListeners.clear()
  }

  exportClip(): Blob {
    if (this.chunks.length === 0) {
      return new Blob([], { type: this.mimeType ?? 'video/webm' })
    }
    const type = this.chunks.at(-1)?.blob.type || this.mimeType || 'video/webm'
    return new Blob(this.chunks.map((chunk) => chunk.blob), { type })
  }

  private resetBuffer(): void {
    this.chunks.splice(0, this.chunks.length)
    this.bufferedDuration = 0
    this.emitBufferUpdate()
  }

  private pushChunk(blob: Blob): void {
    const current = now()
    const delta = clampPositive((current - this.lastTick) / 1000)
    this.lastTick = current
    const duration = delta > 0 ? delta : this.chunkInterval / 1000
    this.chunks.push({ blob, duration })
    this.bufferedDuration += duration

    while (this.bufferedDuration > this.bufferDuration && this.chunks.length > 0) {
      const removed = this.chunks.shift()
      if (!removed) break
      this.bufferedDuration -= removed.duration
    }

    this.emitBufferUpdate()
  }

  private cleanupStream(): void {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        try {
          track.stop()
        } catch {
          // ignore stop errors
        }
      }
      this.mediaStream = null
    }
    if (this.audioCleanup) {
      try {
        this.audioCleanup()
      } catch {
        // ignore cleanup errors
      }
      this.audioCleanup = null
    }
    this.recorder = null
  }

  private emitBufferUpdate(): void {
    const snapshot: RecorderBufferState = {
      duration: this.bufferedDuration,
      limit: this.bufferDuration,
    }
    for (const listener of this.bufferListeners) {
      listener(snapshot)
    }
  }

  private setState(next: RecorderState): void {
    if (this.state === next) return
    this.state = next
    for (const listener of this.stateListeners) {
      listener(next)
    }
  }

  private reportError(error: Error): void {
    this.lastError = error
    for (const listener of this.errorListeners) {
      listener({ error })
    }
    this.setState('error')
  }
}

export default CanvasRecorder
