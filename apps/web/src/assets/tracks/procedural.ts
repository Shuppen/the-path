const DEFAULT_SAMPLE_RATE = 22050

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const sawWave = (time: number, frequency: number): number => {
  const cycle = time * frequency
  return 2 * (cycle - Math.floor(cycle + 0.5))
}

const triangleWave = (time: number, frequency: number): number => {
  return 2 * Math.abs(sawWave(time, frequency)) - 1
}

const squareWave = (time: number, frequency: number): number => {
  return Math.sign(Math.sin(2 * Math.PI * frequency * time)) || 0
}

const pseudoNoise = (seed: number): number => {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  const fractional = value - Math.floor(value)
  return fractional * 2 - 1
}

const applyFade = (samples: Float32Array, sampleRate: number, duration: number): void => {
  const fadeSamples = Math.min(samples.length, Math.max(1, Math.floor(duration * sampleRate)))
  for (let i = 0; i < fadeSamples; i += 1) {
    const factor = i / fadeSamples
    samples[i] *= factor
    const endIndex = samples.length - 1 - i
    if (endIndex >= 0 && endIndex < samples.length) {
      samples[endIndex] *= factor
    }
  }
}

const normalize = (samples: Float32Array, target = 0.92): void => {
  let peak = 0
  for (let i = 0; i < samples.length; i += 1) {
    const magnitude = Math.abs(samples[i])
    if (magnitude > peak) {
      peak = magnitude
    }
  }
  if (peak < 1e-4) {
    return
  }
  const gain = target / peak
  if (gain >= 1 && peak <= target) {
    return
  }
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] *= gain
  }
}

const writeString = (view: DataView, offset: number, value: string): void => {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}

const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const bytesPerSample = 2
  const numChannels = 1
  const blockAlign = bytesPerSample * numChannels
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM header length
  view.setUint16(20, 1, true) // audio format (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = clamp(samples[i], -1, 1)
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += bytesPerSample
  }

  return buffer
}

const encodeBase64 = (buffer: ArrayBuffer): string => {
  const globalBuffer = (globalThis as unknown as {
    Buffer?: { from(data: ArrayBuffer | Uint8Array): { toString(encoding: string): string } }
  }).Buffer
  if (globalBuffer) {
    return globalBuffer.from(buffer).toString('base64')
  }
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(bytes.length, i + chunkSize))
    binary += String.fromCharCode(...chunk)
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary)
  }
  throw new Error('No base64 encoder available')
}

const toDataUri = (samples: Float32Array, sampleRate: number): string => {
  const wavBuffer = encodeWav(samples, sampleRate)
  const base64 = encodeBase64(wavBuffer)
  return `data:audio/wav;base64,${base64}`
}

interface ProceduralTrackSpec {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly description?: string
  readonly duration: number
  readonly bpm: number
  compose(samples: Float32Array, sampleRate: number): void
}

const composeBrightBeats = (samples: Float32Array, sampleRate: number): void => {
  const bpm = 105
  const beatInterval = 60 / bpm
  const arpRate = 1 / (beatInterval / 4)

  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate
    const beatPhase = (t % beatInterval) / beatInterval
    const subPhase = ((t + beatInterval / 2) % beatInterval) / beatInterval

    const kick = Math.exp(-18 * beatPhase) * Math.sin(2 * Math.PI * (60 + beatPhase * 90) * t)
    const snare = Math.exp(-20 * subPhase) * squareWave(t, 220) * 0.2
    const hat = Math.exp(-26 * beatPhase) * triangleWave(t, 1800) * 0.08

    const bass = Math.sin(2 * Math.PI * 55 * t) * 0.22
    const chords =
      0.18 * Math.sin(2 * Math.PI * 220 * t) +
      0.14 * Math.sin(2 * Math.PI * 330 * t + Math.sin(2 * Math.PI * (arpRate / 3) * t))
    const arp = 0.16 * squareWave(t, 440 + 60 * Math.sin(2 * Math.PI * arpRate * t))

    const sparkle = 0.07 * pseudoNoise(i * 0.37 + Math.floor(t / beatInterval) * 1.7)

    samples[i] = kick * 0.6 + snare + hat + bass + chords + arp + sparkle
  }
}

const composeSmoothRush = (samples: Float32Array, sampleRate: number): void => {
  const bpm = 112
  const beatInterval = 60 / bpm
  const padMod = bpm / 120

  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate
    const beatPhase = (t % beatInterval) / beatInterval
    const halfBeatPhase = ((t + beatInterval / 2) % beatInterval) / beatInterval

    const subPulse = Math.exp(-12 * beatPhase) * triangleWave(t, 420) * 0.18
    const clap = Math.exp(-14 * halfBeatPhase) * pseudoNoise(i * 0.51) * 0.16

    const bass = 0.24 * Math.sin(2 * Math.PI * 48 * t + Math.sin(2 * Math.PI * 0.25 * t))
    const pad =
      0.22 * triangleWave(t, 180) * (0.6 + 0.4 * Math.sin(2 * Math.PI * padMod * t)) +
      0.16 * Math.sin(2 * Math.PI * 240 * t + Math.sin(2 * Math.PI * 0.5 * t))
    const lead = 0.18 * Math.sin(2 * Math.PI * (360 + 25 * Math.sin(2 * Math.PI * padMod * t)) * t)

    const shimmer = 0.05 * triangleWave(t, 1400 + 120 * Math.sin(2 * Math.PI * bpm * t * 0.002))

    samples[i] = bass + pad + lead + subPulse + clap + shimmer
  }
}

const composePercussiveDrive = (samples: Float32Array, sampleRate: number): void => {
  const bpm = 98
  const beatInterval = 60 / bpm
  const tripletInterval = beatInterval / 3

  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate
    const beatPhase = (t % beatInterval) / beatInterval
    const tripletPhase = (t % tripletInterval) / tripletInterval

    const kick = Math.exp(-22 * beatPhase) * Math.sin(2 * Math.PI * (48 + beatPhase * 65) * t)
    const rim = Math.exp(-18 * ((t + beatInterval / 3) % beatInterval) / beatInterval) * 0.14 * triangleWave(t, 560)
    const hat = Math.exp(-28 * tripletPhase) * pseudoNoise(i * 0.63) * 0.12

    const bass = 0.26 * triangleWave(t, 70 + 5 * Math.sin(2 * Math.PI * 0.5 * t))
    const seq = 0.2 * squareWave(t, 180 + 20 * Math.sin(2 * Math.PI * beatInterval * t))
    const accent = 0.1 * Math.sin(2 * Math.PI * 520 * t) * Math.exp(-14 * beatPhase)

    samples[i] = kick + rim + hat + bass + seq + accent
  }
}

const TRACK_SPECS: readonly ProceduralTrackSpec[] = [
  {
    id: 'bright-beats',
    title: 'Bright Beats',
    artist: 'Sine Architect',
    description: 'Upbeat pulses rendered procedurally for responsive motion.',
    duration: 8,
    bpm: 105,
    compose: composeBrightBeats,
  },
  {
    id: 'smooth-rush',
    title: 'Smooth Rush',
    artist: 'Harmonic Relay',
    description: 'Layered swells that accelerate into steady percussion.',
    duration: 10.5,
    bpm: 112,
    compose: composeSmoothRush,
  },
  {
    id: 'percussive-drive',
    title: 'Percussive Drive',
    artist: 'Square Wave Unit',
    description: 'Minimal percussive hits carved from synthesized transients.',
    duration: 9.5,
    bpm: 98,
    compose: composePercussiveDrive,
  },
] as const

export interface ProceduralTrackManifestEntry {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly description?: string
  readonly duration: number
  readonly bpm: number
  readonly src: string
}

const createProceduralEntry = (spec: ProceduralTrackSpec): ProceduralTrackManifestEntry => {
  const sampleCount = Math.max(1, Math.round(spec.duration * DEFAULT_SAMPLE_RATE))
  const samples = new Float32Array(sampleCount)
  spec.compose(samples, DEFAULT_SAMPLE_RATE)
  applyFade(samples, DEFAULT_SAMPLE_RATE, 0.08)
  normalize(samples)
  const src = toDataUri(samples, DEFAULT_SAMPLE_RATE)
  return {
    id: spec.id,
    title: spec.title,
    artist: spec.artist,
    description: spec.description,
    duration: samples.length / DEFAULT_SAMPLE_RATE,
    bpm: spec.bpm,
    src,
  }
}

export const PROCEDURAL_TRACKS: readonly ProceduralTrackManifestEntry[] = TRACK_SPECS.map(createProceduralEntry)
