import type { AudioTrackManifestEntry } from '../assets/tracks'
import { EQ_PRESETS, getEqPresetById, type EqPreset } from './eqPresets'
import { ProceduralSfxEngine, type SfxTriggerOptions } from './proceduralSfx'

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

export interface OnsetEvent {
  time: number
  strength: number
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

export interface BeatGridState {
  bpm: number
  interval: number
  offset: number
  lastBeatTime: number
}

export interface GridEvent extends BeatGridState {
  confidence: number
}

export interface QuantizedTime {
  target: number
  index: number
  division: number
  delta: number
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
  onsetSensitivity: number
  onsetMinInterval: number
  gridSmoothing: number
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
  onsetSensitivity: 1.65,
  onsetMinInterval: 0.1,
  gridSmoothing: 0.25,
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
  private masterGain: GainNode | null = null
  private musicBus: GainNode | null = null
  private baseLayerGain: GainNode | null = null
  private percussionLayerGain: GainNode | null = null
  private feverLayerGain: GainNode | null = null
  private duckingGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private voiceGain: GainNode | null = null
  private eqLow: BiquadFilterNode | null = null
  private eqMid: BiquadFilterNode | null = null
  private eqHigh: BiquadFilterNode | null = null
  private feverOscillator: OscillatorNode | null = null
  private feverOscGain: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null

  private frequencyData: Uint8Array | null = null
  private previousSpectrum: Float32Array | null = null
  private bassBand: FrequencyBand | null = null

  private beatHistory: number[] = []
  private energyHistory: number[] = []
  private fluxHistory: number[] = []
  private onsetHistory: number[] = []
  private breakTimer = 0
  private lastBeatEmission = 0
  private lastEnergyEmission = 0
  private lastBreakEmission = 0
  private lastAnalysisTime = 0
  private lastOnsetEmission = 0

  private startOffset = 0
  private startedAt = 0
  private loadToken = 0
  private rafId = 0

  private track: AudioTrackManifestEntry | null = null
  private playbackState: AudioPlaybackState = 'idle'

  private readonly beatListeners = new Set<Listener<BeatEvent>>()
  private readonly onsetListeners = new Set<Listener<OnsetEvent>>()
  private readonly energyListeners = new Set<Listener<EnergySpikeEvent>>()
  private readonly breakListeners = new Set<Listener<BreakEvent>>()
  private readonly progressListeners = new Set<Listener<ProgressEvent>>()
  private readonly stateListeners = new Set<Listener<AudioPlaybackState>>()
  private readonly gridListeners = new Set<Listener<GridEvent>>()
  private readonly externalOutputs = new Set<AudioNode>()
  private readonly customBuffers = new Map<string, AudioBuffer>()
  private readonly customBufferOrder: string[] = []
  private readonly maxCustomBuffers = 6

  private beatGrid: BeatGridState | null = null
  private readonly beatTimes: number[] = []
  private readonly onsetTimes: number[] = []
  private readonly quantizedIndices = new Map<number, number>()

  private percussionEnvelopeTimeout: number | null = null
  private noiseBuffer: AudioBuffer | null = null
  private sfxEngine: ProceduralSfxEngine | null = null
  private eqPresetId = 'flat'
  private customEqBands: EqPreset['bands'] | null = null
  private readonly comboState = {
    combo: 0,
    feverActive: false,
    feverLevel: 0,
  }

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

  onOnset(listener: Listener<OnsetEvent>): () => void {
    this.onsetListeners.add(listener)
    return () => {
      this.onsetListeners.delete(listener)
    }
  }

  onGrid(listener: Listener<GridEvent>): () => void {
    this.gridListeners.add(listener)
    if (this.beatGrid) {
      listener({ ...this.beatGrid, confidence: 1 })
    }
    return () => {
      this.gridListeners.delete(listener)
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

  getBeatGrid(): BeatGridState | null {
    if (!this.beatGrid) return null
    return { ...this.beatGrid }
  }

  quantizeTime(time: number, division = 4): QuantizedTime {
    const grid = this.beatGrid
    if (!grid || !Number.isFinite(time)) {
      return { target: time, index: 0, division, delta: 0 }
    }

    const safeDivision = Math.max(1, Math.floor(division))
    const step = grid.interval / safeDivision
    if (!Number.isFinite(step) || step <= 0) {
      return { target: time, index: 0, division: safeDivision, delta: 0 }
    }

    const relative = (time - grid.offset) / step
    const index = Math.round(relative)
    const target = grid.offset + index * step
    const delta = time - target
    return { target, index, division: safeDivision, delta }
  }

  getDetectedBpm(): number {
    if (this.beatGrid) return this.beatGrid.bpm
    if (this.track?.bpm) return this.track.bpm
    return 0
  }

  getEqPresetId(): string {
    return this.eqPresetId
  }

  listEqPresets(): EqPreset[] {
    return EQ_PRESETS.map((preset) => ({ ...preset }))
  }

  setEqPreset(id: string): void {
    const preset = getEqPresetById(id) ?? EQ_PRESETS[0]
    this.eqPresetId = preset.id
    this.customEqBands = null
    this.applyEqBands(preset)
  }

  setCustomEq(bands: EqPreset['bands']): void {
    this.eqPresetId = 'custom'
    this.customEqBands = { ...bands }
    this.applyEqBands({ id: 'custom', label: 'Custom', bands })
  }

  setMusicVolume(value: number): void {
    if (!this.supported) return
    this.prepareGraph()
    if (!this.musicGain || !this.audioContext) return
    const target = clamp(value, 0, 2)
    const now = this.audioContext.currentTime
    this.musicGain.gain.cancelScheduledValues(now)
    this.musicGain.gain.setTargetAtTime(target, now, 0.08)
  }

  setSfxVolume(value: number): void {
    if (!this.supported) return
    this.prepareGraph()
    if (!this.sfxGain || !this.audioContext) return
    const target = clamp(value, 0, 2)
    const now = this.audioContext.currentTime
    this.sfxGain.gain.cancelScheduledValues(now)
    this.sfxGain.gain.setTargetAtTime(target, now, 0.05)
  }

  setVoiceVolume(value: number): void {
    if (!this.supported) return
    this.prepareGraph()
    if (!this.voiceGain || !this.audioContext) return
    const target = clamp(value, 0, 2)
    const now = this.audioContext.currentTime
    this.voiceGain.gain.cancelScheduledValues(now)
    this.voiceGain.gain.setTargetAtTime(target, now, 0.05)
  }

  updatePerformanceState(state: { combo: number; feverActive: boolean; feverLevel: number }): void {
    this.comboState.combo = Math.max(0, state.combo)
    this.comboState.feverActive = Boolean(state.feverActive)
    this.comboState.feverLevel = clamp(state.feverLevel, 0, 1)
    if (!this.supported || !this.audioContext) return
    this.prepareGraph()
    const ctx = this.audioContext
    const now = ctx.currentTime

    if (this.percussionLayerGain) {
      const combo = this.comboState.combo
      const baseLevel = combo >= 32 ? 0.75 : combo >= 16 ? 0.55 : combo >= 8 ? 0.35 : 0
      this.percussionLayerGain.gain.cancelScheduledValues(now)
      this.percussionLayerGain.gain.setTargetAtTime(baseLevel, now, 0.2)
    }

    if (this.feverLayerGain) {
      const target = this.comboState.feverActive ? clamp(0.4 + this.comboState.feverLevel * 0.6, 0.35, 1.2) : 0
      this.feverLayerGain.gain.cancelScheduledValues(now)
      this.feverLayerGain.gain.setTargetAtTime(target, now, 0.3)
    }

    this.updateFeverOscillator()
  }

  triggerMissDucking(): void {
    if (!this.supported || !this.audioContext || !this.duckingGain) return
    const ctx = this.audioContext
    const now = ctx.currentTime
    const param = this.duckingGain.gain
    param.cancelScheduledValues(now)
    const current = param.value
    param.setValueAtTime(current, now)
    param.linearRampToValueAtTime(Math.max(0.45, current * 0.6), now + 0.04)
    param.setTargetAtTime(1, now + 0.04, 0.4)
  }

  playSfx(name: string, options: SfxTriggerOptions = {}): void {
    const engine = this.getOrCreateSfxEngine()
    engine?.trigger(name, { ...options, grid: this.getBeatGrid() })
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
  ): Promise<{ id: string; duration: number; sampleRate: number; bpm: number; peaks: number[] }> {
    if (!this.supported) {
      throw new Error('Web Audio API is not available in this environment')
    }

    const ctx = this.getOrCreateContext()
    const id = options.id ?? this.generateUploadId()
    const arrayBuffer = await blob.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))

    this.registerCustomBuffer(id, audioBuffer)

    const bpm = this.estimateTempo(audioBuffer)
    const peaks = this.extractPeaks(audioBuffer)

    return {
      id,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      bpm,
      peaks,
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
    this.previousSpectrum = null
    this.beatGrid = null
    this.beatTimes.length = 0
    this.onsetTimes.length = 0
    this.quantizedIndices.clear()
    if (this.percussionEnvelopeTimeout !== null) {
      clearTimeout(this.percussionEnvelopeTimeout)
      this.percussionEnvelopeTimeout = null
    }
    this.masterGain = null
    this.musicBus = null
    this.baseLayerGain = null
    this.percussionLayerGain = null
    this.feverLayerGain = null
    this.duckingGain = null
    this.musicGain = null
    this.sfxGain = null
    this.voiceGain = null
    this.eqLow = null
    this.eqMid = null
    this.eqHigh = null
    if (this.feverOscillator) {
      try {
        this.feverOscillator.stop()
      } catch {
        /* noop */
      }
      this.feverOscillator.disconnect()
    }
    this.feverOscillator = null
    this.feverOscGain = null
    this.noiseBuffer = null
    this.sfxEngine = null
    this.customBuffers.clear()
    this.customBufferOrder.length = 0
    this.audioContext?.close().catch(() => {
      /* noop */
    })
    this.audioContext = null
    this.updatePlaybackState('idle')
  }

  private startPlayback(offset: number): void {
    if (!this.supported || !this.buffer || !this.audioContext || !this.analyser || !this.baseLayerGain) return

    const ctx = this.audioContext
    const clampedOffset = clamp(offset, 0, this.buffer.duration)
    const source = ctx.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.analyser)
    source.connect(this.baseLayerGain)

    source.onended = () => {
      this.source = null
      this.stopAnalysisLoop()
      this.startOffset = this.getDuration()
      this.updatePlaybackState('ended')
      this.emitProgress()
    }

    this.source = source
    this.startedAt = ctx.currentTime - clampedOffset
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
    const ctx = this.audioContext

    if (!this.analyser) {
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = this.options.fftSize
      this.analyser.smoothingTimeConstant = this.options.smoothingTimeConstant
      this.analyser.minDecibels = -110
      this.analyser.maxDecibels = -10
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
    }

    if (!this.masterGain) {
      this.masterGain = ctx.createGain()
      this.masterGain.gain.value = 1
    }

    if (!this.musicBus) {
      this.musicBus = ctx.createGain()
      this.musicBus.gain.value = 1
    }

    if (!this.baseLayerGain) {
      this.baseLayerGain = ctx.createGain()
      this.baseLayerGain.gain.value = 1
    }

    if (!this.percussionLayerGain) {
      this.percussionLayerGain = ctx.createGain()
      this.percussionLayerGain.gain.value = 0
    }

    if (!this.feverLayerGain) {
      this.feverLayerGain = ctx.createGain()
      this.feverLayerGain.gain.value = 0
    }

    if (!this.eqLow) {
      this.eqLow = ctx.createBiquadFilter()
      this.eqLow.type = 'lowshelf'
      this.eqLow.frequency.value = 180
      this.eqLow.gain.value = 0
    }

    if (!this.eqMid) {
      this.eqMid = ctx.createBiquadFilter()
      this.eqMid.type = 'peaking'
      this.eqMid.Q.value = 0.9
      this.eqMid.frequency.value = 920
      this.eqMid.gain.value = 0
    }

    if (!this.eqHigh) {
      this.eqHigh = ctx.createBiquadFilter()
      this.eqHigh.type = 'highshelf'
      this.eqHigh.frequency.value = 4200
      this.eqHigh.gain.value = 0
    }

    if (!this.duckingGain) {
      this.duckingGain = ctx.createGain()
      this.duckingGain.gain.value = 1
    }

    if (!this.musicGain) {
      this.musicGain = ctx.createGain()
      this.musicGain.gain.value = 1
    }

    if (!this.sfxGain) {
      this.sfxGain = ctx.createGain()
      this.sfxGain.gain.value = 0.9
    }

    if (!this.voiceGain) {
      this.voiceGain = ctx.createGain()
      this.voiceGain.gain.value = 0.7
    }

    // Wire buses
    if (this.musicBus && this.eqLow && this.eqMid && this.eqHigh && this.duckingGain && this.musicGain) {
      try {
        this.musicBus.disconnect()
      } catch {
        /* noop */
      }
      this.musicBus.connect(this.eqLow)
      this.eqLow.connect(this.eqMid)
      this.eqMid.connect(this.eqHigh)
      this.eqHigh.connect(this.duckingGain)
      this.duckingGain.connect(this.musicGain)
    }

    if (this.baseLayerGain && this.musicBus) {
      try {
        this.baseLayerGain.disconnect()
      } catch {
        /* noop */
      }
      this.baseLayerGain.connect(this.musicBus)
    }

    if (this.percussionLayerGain && this.musicBus) {
      try {
        this.percussionLayerGain.disconnect()
      } catch {
        /* noop */
      }
      this.percussionLayerGain.connect(this.musicBus)
    }

    if (this.feverLayerGain && this.musicBus) {
      try {
        this.feverLayerGain.disconnect()
      } catch {
        /* noop */
      }
      this.feverLayerGain.connect(this.musicBus)
    }

    const preset =
      this.eqPresetId === 'custom' && this.customEqBands
        ? { id: 'custom', label: 'Custom', bands: this.customEqBands }
        : getEqPresetById(this.eqPresetId) ?? EQ_PRESETS[0]
    if (this.eqLow && this.eqMid && this.eqHigh) {
      this.eqLow.gain.value = clamp(preset.bands.low, -12, 12)
      this.eqMid.gain.value = clamp(preset.bands.mid, -12, 12)
      this.eqHigh.gain.value = clamp(preset.bands.high, -12, 12)
    }

    if (this.masterGain && this.musicGain) {
      try {
        this.musicGain.disconnect()
      } catch {
        /* noop */
      }
      this.musicGain.connect(this.masterGain)
    }

    if (this.sfxGain && this.masterGain) {
      try {
        this.sfxGain.disconnect()
      } catch {
        /* noop */
      }
      this.sfxGain.connect(this.masterGain)
    }

    if (this.voiceGain && this.masterGain) {
      try {
        this.voiceGain.disconnect()
      } catch {
        /* noop */
      }
      this.voiceGain.connect(this.masterGain)
    }

    this.refreshOutputConnections()
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

    this.beatGrid = {
      bpm,
      interval: beatInterval,
      offset: this.startOffset,
      lastBeatTime: this.startOffset,
    }
    this.beatTimes.length = 0
    this.quantizedIndices.clear()

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
    this.fluxHistory = []
    this.onsetHistory = []
    this.onsetTimes.length = 0
    this.lastOnsetEmission = -Infinity
    this.breakTimer = 0
    this.lastBeatEmission = -Infinity
    this.lastEnergyEmission = -Infinity
    this.lastBreakEmission = -Infinity
    this.lastAnalysisTime = this.startOffset
    if (this.beatGrid) {
      this.beatGrid.lastBeatTime = this.startOffset
    }
    if (this.previousSpectrum) {
      this.previousSpectrum.fill(0)
    }
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

    const spectrumLength = frequencyData.length
    if (!this.previousSpectrum || this.previousSpectrum.length !== spectrumLength) {
      this.previousSpectrum = new Float32Array(spectrumLength)
      this.previousSpectrum.fill(0)
    }

    let flux = 0
    for (let i = 0; i < spectrumLength; i += 1) {
      const magnitude = frequencyData[i] / 255
      const deltaMagnitude = magnitude - this.previousSpectrum[i]
      if (deltaMagnitude > 0) {
        flux += deltaMagnitude
      }
      this.previousSpectrum[i] = magnitude
    }

    this.pushHistory(this.fluxHistory, flux)
    const fluxBaseline = this.computeAverage(this.fluxHistory)
    const onsetStrength = fluxBaseline > 0 ? flux / fluxBaseline : 0

    if (
      fluxBaseline > 0 &&
      onsetStrength > this.options.onsetSensitivity &&
      currentTime - this.lastOnsetEmission >= this.options.onsetMinInterval
    ) {
      this.lastOnsetEmission = currentTime
      this.onsetTimes.push(currentTime)
      if (this.onsetTimes.length > 128) {
        this.onsetTimes.shift()
      }
      this.emitOnset({ time: currentTime, strength: onsetStrength })
    }

    const bassBand = this.bassBand ?? { from: 0, to: Math.max(1, Math.floor(spectrumLength * 0.08)) }
    const bassEnergy = average(bassBand.from, bassBand.to)
    const totalEnergy = average(0, spectrumLength - 1)

    this.pushHistory(this.beatHistory, bassEnergy)
    this.pushHistory(this.energyHistory, totalEnergy)

    const beatBaseline = this.computeAverage(this.beatHistory)
    const energyBaseline = this.computeAverage(this.energyHistory)

    if (
      beatBaseline > 0 &&
      bassEnergy > beatBaseline * this.options.beatSensitivity &&
      currentTime - this.lastBeatEmission >= this.options.minBeatInterval
    ) {
      const spectralComponent = onsetStrength > 0 ? clamp(onsetStrength, 1, 3.5) : 1
      const energyComponent = clamp(bassEnergy / (beatBaseline || 1), 0.8, 3.6)
      const confidence = clamp(energyComponent * 0.7 + spectralComponent * 0.3, 0.9, 4)
      this.lastBeatEmission = currentTime
      this.handleBeatDetection(currentTime, confidence)
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

  private emitOnset(event: OnsetEvent): void {
    for (const listener of this.onsetListeners) {
      listener(event)
    }
  }

  private emitGrid(event: GridEvent): void {
    for (const listener of this.gridListeners) {
      listener(event)
    }
  }

  private handleBeatDetection(time: number, confidence: number): void {
    this.beatTimes.push(time)
    if (this.beatTimes.length > 96) {
      this.beatTimes.shift()
    }
    if (this.beatGrid) {
      this.beatGrid.lastBeatTime = time
    }
    this.updateBeatGrid(time, confidence)
    if (this.comboState.combo >= 8) {
      this.triggerPercussionPulse(time, confidence)
    }
    this.updateFeverOscillator()
    this.emitBeat({ time, confidence })
  }

  private updateBeatGrid(time: number, confidence: number): void {
    if (this.beatTimes.length < 4) return

    const intervals: number[] = []
    for (let i = 1; i < this.beatTimes.length; i += 1) {
      const interval = this.beatTimes[i] - this.beatTimes[i - 1]
      if (Number.isFinite(interval) && interval > 0.2 && interval < 2.5) {
        intervals.push(interval)
      }
    }

    if (intervals.length < 3) return

    intervals.sort((a, b) => a - b)
    const median = intervals[Math.floor(intervals.length / 2)]
    const smoothing = clamp(this.options.gridSmoothing, 0.05, 0.95)
    const previousInterval = this.beatGrid?.interval ?? median
    const interval = clamp(previousInterval * (1 - smoothing) + median * smoothing, 0.2, 1.6)
    const bpm = clamp(60 / Math.max(interval, 0.001), 60, 200)
    const offset = this.computeGridOffset(interval)
    this.beatGrid = { bpm, interval, offset, lastBeatTime: time }
    this.emitGrid({ ...this.beatGrid, confidence })
  }

  private computeGridOffset(interval: number): number {
    if (this.beatTimes.length === 0 || !Number.isFinite(interval) || interval <= 0) {
      return this.startOffset
    }
    let accumulator = 0
    let weight = 0
    for (let i = 0; i < this.beatTimes.length; i += 1) {
      const beatTime = this.beatTimes[i]
      if (!Number.isFinite(beatTime)) continue
      accumulator += beatTime - interval * i
      weight += 1
    }
    if (weight <= 0) {
      return this.startOffset
    }
    return accumulator / weight
  }

  private applyEqBands(preset: EqPreset): void {
    if (!this.supported) return
    this.prepareGraph()
    if (!this.audioContext || !this.eqLow || !this.eqMid || !this.eqHigh) return
    const now = this.audioContext.currentTime
    const { bands } = preset
    this.eqLow.gain.cancelScheduledValues(now)
    this.eqLow.gain.setTargetAtTime(clamp(bands.low, -12, 12), now, 0.18)
    this.eqMid.gain.cancelScheduledValues(now)
    this.eqMid.gain.setTargetAtTime(clamp(bands.mid, -12, 12), now, 0.18)
    this.eqHigh.gain.cancelScheduledValues(now)
    this.eqHigh.gain.setTargetAtTime(clamp(bands.high, -12, 12), now, 0.18)
  }

  private getContextTimeForTrackTime(trackTime: number): number {
    if (!this.audioContext) return trackTime
    return this.startedAt + clamp(trackTime, 0, this.getDuration())
  }

  private computeQuantizedFrequency(multiplier = 1): number {
    const grid = this.beatGrid
    if (!grid) {
      return 440 * Math.max(0.25, multiplier)
    }
    let base = 1 / Math.max(grid.interval, 0.001)
    while (base < 110) base *= 2
    while (base > 880) base /= 2
    const target = Math.max(20, base * multiplier)
    const midi = 69 + 12 * Math.log2(target / 440)
    const quantizedMidi = Math.round(midi)
    return 440 * 2 ** ((quantizedMidi - 69) / 12)
  }

  private ensureNoiseBuffer(): AudioBuffer | null {
    if (this.noiseBuffer) return this.noiseBuffer
    if (!this.audioContext) return null
    const ctx = this.audioContext
    const duration = 0.25
    const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < frameCount; i += 1) {
      const fade = 1 - i / frameCount
      channel[i] = (Math.random() * 2 - 1) * fade
    }
    this.noiseBuffer = buffer
    return buffer
  }

  private triggerPercussionPulse(trackTime: number, confidence: number): void {
    if (!this.supported || !this.audioContext || !this.percussionLayerGain) return
    const buffer = this.ensureNoiseBuffer()
    if (!buffer) return
    const ctx = this.audioContext
    const startTime = this.getContextTimeForTrackTime(trackTime)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = clamp(1.6 + confidence * 0.35, 1.2, 3.2)
    const gain = ctx.createGain()
    const peak = clamp(0.35 + Math.min(confidence, 3.5) * 0.12 + Math.min(this.comboState.combo, 64) / 180, 0, 1.1)
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22)
    source.connect(gain)
    gain.connect(this.percussionLayerGain)
    source.start(startTime)
    source.stop(startTime + 0.3)
  }

  private ensureFeverOscillator(): void {
    if (!this.supported || !this.audioContext) return
    if (this.feverOscillator && this.feverOscGain) return
    if (!this.feverLayerGain) return
    const ctx = this.audioContext
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(this.feverLayerGain)
    const oscillator = ctx.createOscillator()
    oscillator.type = 'sawtooth'
    oscillator.frequency.value = this.computeQuantizedFrequency(2)
    oscillator.connect(gain)
    oscillator.start()
    this.feverOscillator = oscillator
    this.feverOscGain = gain
  }

  private updateFeverOscillator(): void {
    if (!this.supported || !this.audioContext) return
    if (!this.comboState.feverActive) {
      if (this.feverOscGain && this.audioContext) {
        const now = this.audioContext.currentTime
        this.feverOscGain.gain.cancelScheduledValues(now)
        this.feverOscGain.gain.setTargetAtTime(0.0001, now, 0.3)
      }
      return
    }

    this.ensureFeverOscillator()
    if (!this.audioContext || !this.feverOscillator || !this.feverOscGain) return
    const ctx = this.audioContext
    const now = ctx.currentTime
    const targetFrequency = this.computeQuantizedFrequency(2.2 + this.comboState.feverLevel * 1.2)
    this.feverOscillator.frequency.setTargetAtTime(targetFrequency, now, 0.18)
    const targetGain = clamp(0.3 + this.comboState.feverLevel * 0.6, 0.2, 1.1)
    this.feverOscGain.gain.cancelScheduledValues(now)
    this.feverOscGain.gain.setTargetAtTime(targetGain, now, 0.25)
  }

  private getOrCreateSfxEngine(): ProceduralSfxEngine | null {
    if (!this.supported) return null
    this.prepareGraph()
    if (!this.audioContext || !this.sfxGain) return null
    if (!this.sfxEngine) {
      this.sfxEngine = new ProceduralSfxEngine(this.audioContext, this.sfxGain, () => this.getBeatGrid())
    }
    return this.sfxEngine
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
    try {
      source.disconnect()
    } catch {
      /* noop */
    }
    this.stopAnalysisLoop()
  }

  private refreshOutputConnections(): void {
    if (!this.supported || !this.audioContext || !this.masterGain) return
    try {
      this.masterGain.disconnect()
    } catch {
      // ignore disconnect errors
    }
    this.masterGain.connect(this.audioContext.destination)
    for (const output of this.externalOutputs) {
      try {
        this.masterGain.connect(output)
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

  private extractPeaks(buffer: AudioBuffer, bucketCount = 128): number[] {
    const channelCount = Math.max(1, buffer.numberOfChannels)
    const frameCount = buffer.length
    const samplesPerBucket = Math.max(1, Math.floor(frameCount / bucketCount))
    const peaks: number[] = []
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = bucket * samplesPerBucket
      if (start >= frameCount) break
      const end = Math.min(frameCount, start + samplesPerBucket)
      let peak = 0
      for (let channel = 0; channel < channelCount; channel += 1) {
        const data = buffer.getChannelData(channel)
        for (let i = start; i < end; i += 1) {
          const value = Math.abs(data[i])
          if (value > peak) peak = value
        }
      }
      peaks.push(peak)
    }
    const max = peaks.reduce((acc, value) => Math.max(acc, value), 0)
    if (max <= 0) {
      return peaks.map(() => 0)
    }
    return peaks.map((value) => clamp(value / max, 0, 1))
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
