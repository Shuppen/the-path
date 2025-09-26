export interface AudioSettings {
  music: number
  sfx: number
  voice: number
  eqPreset: string
  customEq?: {
    low: number
    mid: number
    high: number
  }
}

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  music: 1,
  sfx: 0.9,
  voice: 0.8,
  eqPreset: 'flat',
}

const STORAGE_KEY = 'the-path:audio-preferences'

export const sanitizeAudioSettings = (settings: Partial<AudioSettings>): AudioSettings => {
  const preset = typeof settings.eqPreset === 'string' ? settings.eqPreset : DEFAULT_AUDIO_SETTINGS.eqPreset
  return {
    music: clamp(settings.music ?? DEFAULT_AUDIO_SETTINGS.music, 0, 2),
    sfx: clamp(settings.sfx ?? DEFAULT_AUDIO_SETTINGS.sfx, 0, 2),
    voice: clamp(settings.voice ?? DEFAULT_AUDIO_SETTINGS.voice, 0, 2),
    eqPreset: preset,
    customEq: settings.customEq
      ? {
          low: clamp(settings.customEq.low, -12, 12),
          mid: clamp(settings.customEq.mid, -12, 12),
          high: clamp(settings.customEq.high, -12, 12),
        }
      : undefined,
  }
}

export const readAudioSettings = (storage?: Storage): AudioSettings => {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
  if (!target) return { ...DEFAULT_AUDIO_SETTINGS }
  try {
    const raw = target.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS }
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_AUDIO_SETTINGS }
    }
    return sanitizeAudioSettings(parsed as Partial<AudioSettings>)
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS }
  }
}

export const writeAudioSettings = (settings: AudioSettings, storage?: Storage): void => {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
  if (!target) return
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore persistence failures */
  }
}
