export const ACCEPTED_MIME_TYPES = new Set<string>([
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/aac',
  'audio/mp4',
  'audio/flac',
])

export const ACCEPTED_EXTENSIONS = new Set<string>([
  'mp3',
  'ogg',
  'wav',
  'webm',
  'aac',
  'm4a',
  'flac',
])

export const MIN_AUDIO_DURATION_SECONDS = 5
export const MAX_AUDIO_DURATION_SECONDS = 600

const normalizeExtension = (fileName: string): string => {
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match ? match[1].toLowerCase() : ''
}

export const describeAcceptedFormats = (): string => 'MP3, WAV, OGG, AAC, FLAC или WebM'

export const FILE_NAME_PLACEHOLDER = '{fileName}'

export const UNSUPPORTED_TYPE_ERROR = `Неподдерживаемый формат файла ${FILE_NAME_PLACEHOLDER}. Загрузите ${describeAcceptedFormats()}.`
export const INVALID_DURATION_ERROR = `Трек ${FILE_NAME_PLACEHOLDER} должен длиться от ${MIN_AUDIO_DURATION_SECONDS} до ${MAX_AUDIO_DURATION_SECONDS} секунд.`

export const UNKNOWN_DURATION_ERROR = `Не удалось определить длительность трека ${FILE_NAME_PLACEHOLDER}.`

export const formatValidationErrorMessage = (template: string, fileName: string): string =>
  template.replaceAll(FILE_NAME_PLACEHOLDER, fileName)

export function isSupportedAudioFile(file: File): boolean {
  if (file.type && ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return true
  }
  const extension = normalizeExtension(file.name)
  if (extension && ACCEPTED_EXTENSIONS.has(extension)) {
    return true
  }
  return false
}

export function validateAudioFileType(file: File): string | null {
  return isSupportedAudioFile(file) ? null : UNSUPPORTED_TYPE_ERROR
}

export function validateAudioDuration(duration: number): string | null {
  if (!Number.isFinite(duration) || duration <= 0) {
    return UNKNOWN_DURATION_ERROR
  }
  if (duration < MIN_AUDIO_DURATION_SECONDS || duration > MAX_AUDIO_DURATION_SECONDS) {
    return INVALID_DURATION_ERROR
  }
  return null
}
