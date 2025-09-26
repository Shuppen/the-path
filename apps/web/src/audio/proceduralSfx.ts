import presetsJson from './sfxPresets.json'

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

export interface BeatGridSnapshot {
  interval: number
}

export interface SfxTriggerOptions {
  intensity?: number
  grid?: BeatGridSnapshot | null
}

interface RawOscillatorPreset {
  readonly type: OscillatorType
  readonly ratio: number
  readonly gain: number
  readonly detune?: number
}

interface RawNoisePreset {
  readonly type: 'white' | 'pink'
  readonly gain: number
  readonly decay?: number
}

interface RawFilterPreset {
  readonly type: BiquadFilterType
  readonly frequency: number
  readonly Q?: number
}

interface RawEnvelopePreset {
  readonly attack: number
  readonly decay: number
  readonly sustain: number
  readonly release: number
}

interface RawSfxPreset {
  readonly gain: number
  readonly envelope: RawEnvelopePreset
  readonly oscillators?: RawOscillatorPreset[]
  readonly noise?: RawNoisePreset
  readonly filter?: RawFilterPreset
  readonly pitchJitter?: number
}

const PRESETS = presetsJson as Record<string, RawSfxPreset>

const toSeconds = (value: number): number => clamp(value, 0.001, 4)

const quantizeFrequency = (frequency: number): number => {
  const clamped = clamp(frequency, 20, 16000)
  const midi = 69 + 12 * Math.log2(clamped / 440)
  const rounded = Math.round(midi)
  return 440 * 2 ** ((rounded - 69) / 12)
}

const pinkNoiseBuffer = (context: AudioContext): AudioBuffer => {
  const length = Math.floor(context.sampleRate * 0.5)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1
    b0 = 0.997 * b0 + white * 0.0997
    b1 = 0.985 * b1 + white * 0.1348
    b2 = 0.950 * b2 + white * 0.1159
    data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.3
  }
  return buffer
}

const whiteNoiseBuffer = (context: AudioContext): AudioBuffer => {
  const length = Math.floor(context.sampleRate * 0.4)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    const fade = 1 - i / length
    data[i] = (Math.random() * 2 - 1) * fade
  }
  return buffer
}

const NOISE_CACHE = new WeakMap<AudioContext, { white: AudioBuffer; pink: AudioBuffer }>()

const resolveNoiseBuffer = (context: AudioContext, type: 'white' | 'pink'): AudioBuffer => {
  const cached = NOISE_CACHE.get(context)
  if (cached) {
    return cached[type]
  }
  const entry = {
    white: whiteNoiseBuffer(context),
    pink: pinkNoiseBuffer(context),
  }
  NOISE_CACHE.set(context, entry)
  return entry[type]
}

export class ProceduralSfxEngine {
  constructor(
    private readonly context: AudioContext,
    private readonly output: GainNode,
    private readonly gridProvider: () => BeatGridSnapshot | null,
  ) {}

  trigger(name: string, options: SfxTriggerOptions = {}): void {
    const preset = PRESETS[name]
    if (!preset) return

    const intensity = clamp(options.intensity ?? 1, 0.1, 2.5)
    const now = this.context.currentTime

    const envelopeGain = this.context.createGain()
    envelopeGain.gain.value = 0

    const targetNode = preset.filter ? this.createFilterChain(preset.filter, envelopeGain) : envelopeGain

    if (preset.oscillators?.length) {
      for (const oscPreset of preset.oscillators) {
        this.createOscillatorVoice(oscPreset, preset, intensity, targetNode, options.grid)
      }
    }

    if (preset.noise) {
      this.createNoiseVoice(preset.noise, preset, intensity, targetNode)
    }

    const duration =
      preset.envelope.attack + preset.envelope.decay + preset.envelope.release + Math.max(0.05, preset.envelope.sustain * 0.12)

    envelopeGain.connect(this.output)
    envelopeGain.gain.setValueAtTime(0, now)
    envelopeGain.gain.linearRampToValueAtTime(preset.gain * intensity, now + toSeconds(preset.envelope.attack))
    const sustainLevel = clamp(preset.envelope.sustain, 0, 1) * preset.gain * intensity
    envelopeGain.gain.linearRampToValueAtTime(sustainLevel + 0.0001, now + toSeconds(preset.envelope.attack + preset.envelope.decay))
    envelopeGain.gain.setTargetAtTime(0.0001, now + duration, Math.max(0.08, preset.envelope.release * 0.65))

    setTimeout(() => {
      try {
        envelopeGain.disconnect()
      } catch {
        /* noop */
      }
    }, Math.ceil(duration * 1000) + 120)
  }

  private resolveFrequency(ratio: number, gridOverride?: BeatGridSnapshot | null): number {
    const grid = gridOverride ?? this.gridProvider()
    if (!grid) {
      return quantizeFrequency(440 * ratio)
    }
    let base = 1 / Math.max(grid.interval, 0.001)
    while (base < 55) base *= 2
    while (base > 880) base /= 2
    const fundamental = base * 4
    const jitter = (Math.random() * 2 - 1) * 0.5
    return quantizeFrequency((fundamental + jitter) * ratio)
  }

  private createOscillatorVoice(
    oscPreset: RawOscillatorPreset,
    preset: RawSfxPreset,
    intensity: number,
    destination: AudioNode,
    gridOverride?: BeatGridSnapshot | null,
  ): void {
    const oscillator = this.context.createOscillator()
    oscillator.type = oscPreset.type
    oscillator.frequency.value = this.resolveFrequency(oscPreset.ratio, gridOverride)
    if (oscPreset.detune) {
      oscillator.detune.value = oscPreset.detune
    }

    const gain = this.context.createGain()
    const peak = clamp(oscPreset.gain * preset.gain * intensity, 0, 2)
    const now = this.context.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak, now + toSeconds(preset.envelope.attack * 0.6))
    gain.gain.exponentialRampToValueAtTime(0.0001, now + toSeconds(preset.envelope.attack + preset.envelope.decay + preset.envelope.release))

    oscillator.connect(gain)
    gain.connect(destination)
    oscillator.start(now)
    oscillator.stop(now + toSeconds(preset.envelope.attack + preset.envelope.decay + preset.envelope.release * 1.5))
  }

  private createNoiseVoice(noisePreset: RawNoisePreset, preset: RawSfxPreset, intensity: number, destination: AudioNode): void {
    const buffer = resolveNoiseBuffer(this.context, noisePreset.type)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = noisePreset.type === 'pink' ? 1 : 2.1

    const gain = this.context.createGain()
    const now = this.context.currentTime
    const maxGain = clamp(noisePreset.gain * preset.gain * intensity, 0, 2)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(maxGain, now + toSeconds(preset.envelope.attack * 0.4))
    gain.gain.exponentialRampToValueAtTime(0.0001, now + toSeconds(noisePreset.decay ?? preset.envelope.decay))

    source.connect(gain)
    gain.connect(destination)
    source.start(now)
    source.stop(now + toSeconds((noisePreset.decay ?? preset.envelope.decay) + preset.envelope.release))
  }

  private createFilterChain(filterPreset: RawFilterPreset, envelopeGain: GainNode): BiquadFilterNode {
    const filter = this.context.createBiquadFilter()
    filter.type = filterPreset.type
    filter.frequency.value = clamp(filterPreset.frequency, 40, 16000)
    filter.Q.value = clamp(filterPreset.Q ?? 1, 0.05, 24)
    filter.connect(envelopeGain)
    return filter
  }
}
