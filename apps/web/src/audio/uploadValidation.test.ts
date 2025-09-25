import { describe, expect, it } from 'vitest'
import {
  formatValidationErrorMessage,
  INVALID_DURATION_ERROR,
  MIN_AUDIO_DURATION_SECONDS,
  MAX_AUDIO_DURATION_SECONDS,
  UNKNOWN_DURATION_ERROR,
  UNSUPPORTED_TYPE_ERROR,
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

    const file = createFile('document.txt', 'text/plain')
    const errorTemplate = validateAudioFileType(file)
    expect(errorTemplate).toBe(UNSUPPORTED_TYPE_ERROR)
    expect(formatValidationErrorMessage(errorTemplate!, file.name)).toContain(file.name)

  })

  it('validates duration boundaries', () => {
    const fileName = 'loop.mp3'
    const tooShort = validateAudioDuration(MIN_AUDIO_DURATION_SECONDS - 1)
    expect(tooShort).toBe(INVALID_DURATION_ERROR)
    expect(formatValidationErrorMessage(tooShort!, fileName)).toContain(fileName)

    const tooLong = validateAudioDuration(MAX_AUDIO_DURATION_SECONDS + 5)
    expect(tooLong).toBe(INVALID_DURATION_ERROR)
    expect(formatValidationErrorMessage(tooLong!, fileName)).toContain(fileName)

    const unknown = validateAudioDuration(0)
    expect(unknown).toBe(UNKNOWN_DURATION_ERROR)
    expect(formatValidationErrorMessage(unknown!, fileName)).toContain(fileName)

    expect(validateAudioDuration(120)).toBeNull()
  })
})
