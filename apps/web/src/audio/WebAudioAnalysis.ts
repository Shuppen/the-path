import type { AudioTrackManifestEntry } from '../assets/tracks'

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

type AudioContextConstructor = typeof AudioContext

const resolveAudioContextConstructor = (): AudioContextConstructor | null => {
  if (typeof window === 'undefined') return null
  const audioWindow = window as Window & { webkitAudioContext?: AudioContextConstructor }
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null
}

export type AudioPlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended'

export interface BeatEvent {
  time: number
  confidence: number
}

export interface EnergySpikeEvent {
  time: number
  intensity: number
}

export interface BreakEvent {
  time: number
  duration: number
}

export interface ProgressEvent {
  time: number
  duration: number
  progress: number
}

export interface WebAudioAnalysisOptions {
  fftSize: number
  smoothingTimeConstant: number
  minBeatInterval: number
  beatSensitivity: number
  energySpikeSensitivity: number
  minEnergyInterval: number
  breakThreshold: number
  breakHoldTime: number
  minBreakInterval: number
  historySize: number
  bassRange: readonly [number, number]
}

const DEFAULT_OPTIONS: WebAudioAnalysisOptions = {
  fftSize: 2048,
  smoothingTimeConstant: 0.75,
  minBeatInterval: 0.28,
  beatSensitivity: 1.32,
  energySpikeSensitivity: 1.45,
  minEnergyInterval: 0.55,
  breakThreshold: 0.72,
  breakHoldTime: 0.6,
  minBreakInterval: 2.5,
  historySize: 48,
  bassRange: [40, 180],
}

type Listener<T> = (payload: T) => void

interface FrequencyBand {
  from: number
  to: number
}

export class WebAudioAnalysis {
  private readonly options: WebAudioAnalysisOptions
  private readonly supported: boolean

  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private gainNode: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null

  private frequencyData: Uint8Array | null = null
  private bassBand: FrequencyBand | null = null

  private beatHistory: number[] = []
  private energyHistory: number[] = []
  private breakTimer = 0
  private lastBeatEmission = 0
  private lastEnergyEmission = 0
  private lastBreakEmission = 0
  private lastAnalysisTime = 0

  private startOffset = 0
  private startedAt = 0
  private loadToken = 0
  private rafId = 0

  private track: AudioTrackManifestEntry | null = null
  private playbackState: AudioPlaybackState = 'idle'

  private readonly beatListeners = new Set<Listener<BeatEvent>>()
  private readonly energyListeners = new Set<Listener<EnergySpikeEvent>>()
  private readonly breakListeners = new Set<Listener<BreakEvent>>()
  private readonly progressListeners = new Set<Listener<ProgressEvent>>()
  private readonly stateListeners = new Set<Listener<AudioPlaybackState>>()
  private readonly externalOutputs = new Set<AudioNode>()

  constructor(options: Partial<WebAudioAnalysisOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.supported = resolveAudioContextConstructor() !== null
  }

  onBeat(listener: Listener<BeatEvent>): () => void {
    this.beatListeners.add(listener)
    return () => {
      this.beatListeners.delete(listener)
    }
  }

  onEnergySpike(listener: Listener<EnergySpikeEvent>): () => void {
    this.energyListeners.add(listener)
    return () => {
      this.energyListeners.delete(listener)
    }
  }

  onBreak(listener: Listener<BreakEvent>): () => void {
    this.breakListeners.add(listener)
    return () => {
      this.breakListeners.delete(listener)
    }
  }

  onProgress(listener: Listener<ProgressEvent>): () => void {
    this.progressListeners.add(listener)
    return () => {
      this.progressListeners.delete(listener)
    }
  }

  onStateChange(listener: Listener<AudioPlaybackState>): () => void {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  createRecordingStream(): { stream: MediaStream; disconnect: () => void } | null {
    if (!this.supported) return null
    const context = this.getOrCreateContext()
    this.prepareGraph()
    const destination = context.createMediaStreamDestination()
    this.externalOutputs.add(destination)
    this.refreshOutputConnections()
    return {
      stream: destination.stream,
      disconnect: () => {
        this.externalOutputs.delete(destination)
        this.refreshOutputConnections()
        try {
          destination.disconnect()
        } catch {
          // ignore disconnect errors
        }
      },
    }
  }

  getState(): AudioPlaybackState {
    return this.playbackState
  }

  isSupported(): boolean {
    return this.supported
  }

  getCurrentTime(): number {
    if (!this.audioContext) {
      return this.startOffset
    }
    if (this.playbackState === 'playing') {
      const current = this.audioContext.currentTime - this.startedAt
      return clamp(current, 0, this.getDuration())
    }
    return clamp(this.startOffset, 0, this.getDuration())
  }

  getDuration(): number {
    if (this.buffer) return this.buffer.duration
    if (this.track) return this.track.duration
    return 0
  }

  async load(track: AudioTrackManifestEntry): Promise<void> {
    this.track = track
    this.loadToken += 1
    const token = this.loadToken

    this.stopSource(false)
    this.buffer = null
    this.startOffset = 0
    this.startedAt = 0

    if (!this.supported) {
      this.updatePlaybackState('ready')
      this.emitProgress()
      return
    }

    const ctx = this.getOrCreateContext()
    this.updatePlaybackState('loading')

    try {
      const response = await fetch(track.src)
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      if (token !== this.loadToken) return

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      if (token !== this.loadToken) return

      this.buffer = audioBuffer
      this.prepareGraph()
      this.updateFrequencyBands()
      this.startOffset = 0
      this.startedAt = ctx.currentTime
      this.resetAnalysisState()
      this.updatePlaybackState('ready')
      this.emitProgress()
    } catch (error) {
      console.error(error)
      if (token === this.loadToken) {
        this.updatePlaybackState('idle')
      }
    }
  }

  async play(): Promise<void> {
    if (!this.buffer || !this.supported) return

    const ctx = this.getOrCreateContext()
    await ctx.resume()

    this.prepareGraph()
    this.startPlayback(this.startOffset)
  }

  pause(): void {
    if (this.playbackState !== 'playing') return
    const current = this.getCurrentTime()
    this.startOffset = current
    this.stopSource(false)
    this.updatePlaybackState('paused')
    this.emitProgress()
  }

  stop(): void {
    this.startOffset = 0
    this.stopSource(false)
    if (this.buffer) {
      this.updatePlaybackState('ready')
    } else {
      this.updatePlaybackState('idle')
    }
    this.emitProgress()
  }

  setCurrentTime(time: number): void {
    const duration = this.getDuration()
    if (duration <= 0) {
      this.startOffset = 0
      return
    }
    const clamped = clamp(time, 0, duration)
    this.startOffset = clamped
    if (this.playbackState === 'playing') {
      this.stopSource(false)
      this.startPlayback(clamped)
    } else {
      this.emitProgress()
    }
  }

  destroy(): void {
    this.stopSource(false)
    this.stopAnalysisLoop()
    this.buffer = null
    this.track = null
    this.frequencyData = null
    this.audioContext?.close().catch(() => {
      /* noop */
    })
    this.audioContext = null
    this.updatePlaybackState('idle')
  }

  private startPlayback(offset: number): void {
    if (!this.supported || !this.buffer || !this.analyser || !this.gainNode || !this.audioContext) return

    const clampedOffset = clamp(offset, 0, this.buffer.duration)
    const source = this.audioContext.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.analyser)
    this.analyser.connect(this.gainNode)

    source.onended = () => {
      this.source = null
      this.stopAnalysisLoop()
      this.startOffset = this.getDuration()
      this.updatePlaybackState('ended')
      this.emitProgress()
    }

    this.source = source
    this.startedAt = this.audioContext.currentTime - clampedOffset
    this.startOffset = clampedOffset
    this.resetAnalysisState()
    this.updatePlaybackState('playing')
    this.emitProgress()
    this.startAnalysisLoop()

    try {
      source.start(0, clampedOffset)
    } catch (error) {
      console.error(error)
    }
  }

  private prepareGraph(): void {
    if (!this.supported || !this.audioContext) return
    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = this.options.fftSize
      this.analyser.smoothingTimeConstant = this.options.smoothingTimeConstant
      this.analyser.minDecibels = -110
      this.analyser.maxDecibels = -10
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
    }
    if (!this.gainNode) {
      this.gainNode = this.audioContext.createGain()
      this.gainNode.gain.value = 1
    }
    this.refreshOutputConnections()
    if (this.analyser && this.gainNode) {
      try {
        this.analyser.disconnect()
      } catch {
        // ignore
      }
      this.analyser.connect(this.gainNode)
    }
  }

  private updateFrequencyBands(): void {
    if (!this.supported || !this.analyser || !this.audioContext) return
    const nyquist = this.audioContext.sampleRate / 2
    const [low, high] = this.options.bassRange
    const clampedLow = clamp(low, 0, nyquist)
    const clampedHigh = clamp(high, clampedLow, nyquist)
    const binCount = this.analyser.frequencyBinCount

    const from = Math.max(0, Math.floor((clampedLow / nyquist) * binCount))
    const to = Math.min(binCount - 1, Math.ceil((clampedHigh / nyquist) * binCount))
    this.bassBand = { from, to }
  }

  private resetAnalysisState(): void {
    this.beatHistory = []
    this.energyHistory = []
    this.breakTimer = 0
    this.lastBeatEmission = -Infinity
    this.lastEnergyEmission = -Infinity
    this.lastBreakEmission = -Infinity
    this.lastAnalysisTime = this.startOffset
  }

  private startAnalysisLoop(): void {
    if (!this.supported || typeof window === 'undefined') return
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
    }

    const step = () => {
      if (!this.analyser || !this.frequencyData) {
        this.rafId = 0
        return
      }

      this.analyser.getByteFrequencyData(this.frequencyData)
      this.processAnalysisFrame(this.frequencyData)

      if (this.playbackState === 'playing') {
        this.rafId = requestAnimationFrame(step)
      } else {
        this.rafId = 0
      }
    }

    this.rafId = requestAnimationFrame(step)
  }

  private stopAnalysisLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  private processAnalysisFrame(frequencyData: Uint8Array): void {
    const duration = this.getDuration()
    if (duration <= 0) return

    const currentTime = this.getCurrentTime()
    const delta = Math.max(0, currentTime - this.lastAnalysisTime)
    this.lastAnalysisTime = currentTime

    this.emitProgress()

    const average = (from: number, to: number): number => {
      const clampedFrom = clamp(Math.floor(from), 0, frequencyData.length - 1)
      const clampedTo = clamp(Math.ceil(to), clampedFrom, frequencyData.length - 1)
      let total = 0
      let count = 0
      for (let i = clampedFrom; i <= clampedTo; i += 1) {
        total += frequencyData[i]
        count += 1
      }
      if (count <= 0) return 0
      return total / count
    }

    const bassBand = this.bassBand ?? { from: 0, to: Math.max(1, Math.floor(frequencyData.length * 0.08)) }
    const bassEnergy = average(bassBand.from, bassBand.to)
    const totalEnergy = average(0, frequencyData.length - 1)

    this.pushHistory(this.beatHistory, bassEnergy)
    this.pushHistory(this.energyHistory, totalEnergy)

    const beatBaseline = this.computeAverage(this.beatHistory)
    const energyBaseline = this.computeAverage(this.energyHistory)

    if (
      beatBaseline > 0 &&
      bassEnergy > beatBaseline * this.options.beatSensitivity &&
      currentTime - this.lastBeatEmission >= this.options.minBeatInterval
    ) {
      const confidence = clamp(bassEnergy / (beatBaseline || 1), 1, 3)
      this.lastBeatEmission = currentTime
      this.emitBeat({ time: currentTime, confidence })
    }

    if (
      energyBaseline > 0 &&
      totalEnergy > energyBaseline * this.options.energySpikeSensitivity &&
      currentTime - this.lastEnergyEmission >= this.options.minEnergyInterval
    ) {
      const intensity = clamp(totalEnergy / (energyBaseline || 1), 1, 4)
      this.lastEnergyEmission = currentTime
      this.emitEnergySpike({ time: currentTime, intensity })
    }

    if (energyBaseline <= 0) {
      this.breakTimer = 0
      return
    }

    if (totalEnergy < energyBaseline * this.options.breakThreshold) {
      this.breakTimer += delta
      if (
        this.breakTimer >= this.options.breakHoldTime &&
        currentTime - this.lastBreakEmission >= this.options.minBreakInterval
      ) {
        this.lastBreakEmission = currentTime
        this.emitBreak({ time: currentTime, duration: this.breakTimer })
        this.breakTimer = 0
      }
    } else {
      this.breakTimer = Math.max(0, this.breakTimer - delta * 0.5)
    }
  }

  private pushHistory(history: number[], value: number): void {
    history.push(value)
    if (history.length > this.options.historySize) {
      history.shift()
    }
  }

  private computeAverage(history: number[]): number {
    if (history.length === 0) return 0
    let total = 0
    for (const value of history) {
      total += value
    }
    return total / history.length
  }

  private emitBeat(event: BeatEvent): void {
    for (const listener of this.beatListeners) {
      listener(event)
    }
  }

  private emitEnergySpike(event: EnergySpikeEvent): void {
    for (const listener of this.energyListeners) {
      listener(event)
    }
  }

  private emitBreak(event: BreakEvent): void {
    for (const listener of this.breakListeners) {
      listener(event)
    }
  }

  private emitProgress(): void {
    const duration = this.getDuration()
    const time = clamp(this.getCurrentTime(), 0, duration)
    const progress = duration > 0 ? clamp(time / duration, 0, 1) : 0
    const payload: ProgressEvent = { time, duration, progress }
    for (const listener of this.progressListeners) {
      listener(payload)
    }
  }

  private updatePlaybackState(next: AudioPlaybackState): void {
    if (this.playbackState === next) return
    this.playbackState = next
    for (const listener of this.stateListeners) {
      listener(next)
    }
  }

  private stopSource(allowEndedCallback: boolean): void {
    if (!this.source) return
    const source = this.source
    this.source = null
    if (!allowEndedCallback) {
      source.onended = null
    }
    try {
      source.stop()
    } catch {
      // ignore
    }
    source.disconnect()
    this.stopAnalysisLoop()
  }

  private refreshOutputConnections(): void {
    if (!this.supported || !this.audioContext || !this.gainNode) return
    try {
      this.gainNode.disconnect()
    } catch {
      // ignore disconnect errors
    }
    this.gainNode.connect(this.audioContext.destination)
    for (const output of this.externalOutputs) {
      try {
        this.gainNode.connect(output)
      } catch {
        // ignore connection errors
      }
    }
  }

  private getOrCreateContext(): AudioContext {
    if (this.audioContext) return this.audioContext
    const AudioContextCtor = resolveAudioContextConstructor()
    if (!AudioContextCtor) {
      throw new Error('Web Audio API is not available in this environment')
    }
    const context = new AudioContextCtor()
    this.audioContext = context
    return context
  }
}
