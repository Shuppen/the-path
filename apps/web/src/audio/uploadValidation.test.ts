import { describe, expect, it } from 'vitest'
import {
  INVALID_DURATION_ERROR,
  MIN_AUDIO_DURATION_SECONDS,
  MAX_AUDIO_DURATION_SECONDS,
  UNKNOWN_DURATION_ERROR,
  validateAudioDuration,
  validateAudioFileType,
} from './uploadValidation'

const createFile = (name: string, type: string) => new File(['test'], name, { type })

describe('uploadValidation', () => {
  it('accepts supported mime types', () => {
    expect(validateAudioFileType(createFile('track.mp3', 'audio/mpeg'))).toBeNull()
    expect(validateAudioFileType(createFile('track.mp3', 'audio/mp3'))).toBeNull()
    expect(validateAudioFileType(createFile('beat.ogg', 'audio/ogg'))).toBeNull()
    expect(validateAudioFileType(createFile('wave.wav', 'audio/wav'))).toBeNull()
    expect(validateAudioFileType(createFile('wave.wav', 'audio/x-wav'))).toBeNull()
  })

  it('accepts supported extensions when mime type missing', () => {
    expect(validateAudioFileType(createFile('beat.ogg', ''))).toBeNull()
    expect(validateAudioFileType(createFile('song.mp3', ''))).toBeNull()
    expect(validateAudioFileType(createFile('wave.wav', ''))).toBeNull()
  })

  it('rejects unsupported formats', () => {
    expect(validateAudioFileType(createFile('document.txt', 'text/plain'))).toMatch(/Неподдерживаемый формат/)
    expect(validateAudioFileType(createFile('voice.webm', 'audio/webm'))).toMatch(/Неподдерживаемый формат/)
    expect(validateAudioFileType(createFile('voice.webm', ''))).toMatch(/Неподдерживаемый формат/)
  })

  it('validates duration boundaries', () => {
    expect(validateAudioDuration(MIN_AUDIO_DURATION_SECONDS - 1)).toBe(INVALID_DURATION_ERROR)
    expect(validateAudioDuration(MAX_AUDIO_DURATION_SECONDS + 5)).toBe(INVALID_DURATION_ERROR)
    expect(validateAudioDuration(0)).toBe(UNKNOWN_DURATION_ERROR)
    expect(validateAudioDuration(120)).toBeNull()
  })
})
