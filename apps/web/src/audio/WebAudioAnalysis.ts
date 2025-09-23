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
  // Use global AudioContext if available, fall back to webkit prefixed version
  return (typeof AudioContext !== 'undefined' ? AudioContext : audioWindow.webkitAudioContext) ?? null
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
  private readonly customBuffers = new Map<string, AudioBuffer>()
  private readonly customBufferOrder: string[] = []
  private readonly maxCustomBuffers = 6

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

  hasCustomTrack(id: string): boolean {
    return this.customBuffers.has(id)
  }

  removeCustomTrack(id: string): void {
    this.customBuffers.delete(id)
    const index = this.customBufferOrder.indexOf(id)
    if (index !== -1) {
      this.customBufferOrder.splice(index, 1)
    }
  }

  async importFromBlob(
    blob: Blob,
    options: { id?: string } = {},
  ): Promise<{ id: string; duration: number; sampleRate: number; bpm: number }> {
    if (!this.supported) {
      throw new Error('Web Audio API is not available in this environment')
    }

    const ctx = this.getOrCreateContext()
    const id = options.id ?? this.generateUploadId()
    const arrayBuffer = await blob.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))

    this.registerCustomBuffer(id, audioBuffer)

    const bpm = this.estimateTempo(audioBuffer)

    return {
      id,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      bpm,
    }
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
      let audioBuffer: AudioBuffer | null = null
      if (track.src) {
        const response = await fetch(track.src)
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        if (token !== this.loadToken) return
        audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
      } else if (track.id) {
        audioBuffer = this.customBuffers.get(track.id) ?? null
        if (!audioBuffer) {
          throw new Error(`No registered buffer for track ${track.id}`)
        }
      }

      if (token !== this.loadToken) return

      if (!audioBuffer) {
        throw new Error('Unable to resolve audio buffer for track')
      }

      this.buffer = audioBuffer
      const bpm = Number.isFinite(track.bpm) && track.bpm > 0 ? track.bpm : this.estimateTempo(audioBuffer)
      this.track = { ...track, bpm }
      this.configureForBuffer(audioBuffer, bpm)
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
    this.customBuffers.clear()
    this.customBufferOrder.length = 0
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

  private configureForBuffer(buffer: AudioBuffer, bpmHint?: number): void {
    if (!this.supported) return
    const sampleRate = buffer.sampleRate || 44100
    const targetWindow = clamp(Math.round(sampleRate * 0.05), 256, 32768)
    this.options.fftSize = this.computeFftSize(targetWindow)
    this.prepareGraph()

    if (this.analyser) {
      this.analyser.fftSize = this.options.fftSize
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
    }

    const windowSeconds = this.options.fftSize / sampleRate
    const bpm = Number.isFinite(bpmHint) && bpmHint ? bpmHint : this.estimateTempo(buffer)
    const beatInterval = clamp(60 / clamp(bpm, 60, 180), 0.25, 1.5)

    this.options.minBeatInterval = clamp(beatInterval * 0.6, 0.18, 0.8)
    this.options.minEnergyInterval = clamp(beatInterval * 0.85, 0.25, 2.5)
    this.options.breakHoldTime = clamp(windowSeconds * 6, 0.35, 2.4)
    this.options.minBreakInterval = clamp(beatInterval * 2.2, 1, 5.5)
    this.options.historySize = Math.max(32, Math.round(6 / Math.max(windowSeconds, 0.02)))

    this.updateFrequencyBands()
  }

  private computeFftSize(target: number): number {
    let size = 256
    while (size < target) {
      size *= 2
    }
    return clamp(size, 512, 32768)
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

  private registerCustomBuffer(id: string, buffer: AudioBuffer): void {
    this.customBuffers.set(id, buffer)
    const existingIndex = this.customBufferOrder.indexOf(id)
    if (existingIndex !== -1) {
      this.customBufferOrder.splice(existingIndex, 1)
    }
    this.customBufferOrder.push(id)
    while (this.customBufferOrder.length > this.maxCustomBuffers) {
      const oldest = this.customBufferOrder.shift()
      if (oldest) {
        this.customBuffers.delete(oldest)
      }
    }
  }

  private estimateTempo(buffer: AudioBuffer): number {
    const sampleRate = buffer.sampleRate || 44100
    const frameCount = buffer.length
    const channelCount = Math.max(1, buffer.numberOfChannels)
    const windowSize = clamp(Math.floor(sampleRate * 0.05), 1024, 8192)

    const channels: Float32Array[] = []
    for (let channel = 0; channel < channelCount; channel += 1) {
      channels.push(buffer.getChannelData(channel))
    }

    const energies: number[] = []
    for (let offset = 0; offset < frameCount; offset += windowSize) {
      const end = Math.min(frameCount, offset + windowSize)
      const length = Math.max(1, end - offset)
      let total = 0
      for (const channel of channels) {
        for (let i = offset; i < end; i += 1) {
          const sample = channel[i]
          total += sample * sample
        }
      }
      energies.push(total / (length * channelCount))
    }

    if (energies.length < 2) {
      return 110
    }

    const averageEnergy = energies.reduce((acc, value) => acc + value, 0) / energies.length
    if (averageEnergy <= 0) {
      return 110
    }

    const threshold = averageEnergy * 1.35
    const peakTimes: number[] = []
    for (let i = 1; i < energies.length - 1; i += 1) {
      const energy = energies[i]
      if (energy <= threshold) continue
      if (energy <= energies[i - 1] || energy < energies[i + 1]) continue
      peakTimes.push((i * windowSize) / sampleRate)
    }

    if (peakTimes.length < 2) {
      return 110
    }

    const counts = new Map<number, number>()
    for (let i = 1; i < peakTimes.length; i += 1) {
      const interval = peakTimes[i] - peakTimes[i - 1]
      if (!Number.isFinite(interval) || interval <= 0.2 || interval >= 2.5) {
        continue
      }
      let bpm = 60 / interval
      while (bpm < 60) bpm *= 2
      while (bpm > 190) bpm /= 2
      const rounded = Math.round(bpm)
      counts.set(rounded, (counts.get(rounded) ?? 0) + 1)
    }

    if (counts.size === 0) {
      return 110
    }

    let bestBpm = 110
    let bestScore = -Infinity
    for (const [bpm, score] of counts) {
      if (score > bestScore) {
        bestScore = score
        bestBpm = bpm
      } else if (score === bestScore && Math.abs(bpm - 110) < Math.abs(bestBpm - 110)) {
        bestBpm = bpm
      }
    }

    return clamp(bestBpm, 60, 180)
  }

  private generateUploadId(): string {
    return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
