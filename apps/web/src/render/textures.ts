import manifestSource from '../../public/textures/manifest.json?raw'

export interface TextureInfo {
  path: string
  scale?: number
  palette: string[]
}

type TextureRecord = {
  info: TextureInfo
  image?: HTMLImageElement
  error?: unknown
  promise?: Promise<HTMLImageElement>
}

type PatternOptions = {
  repetition?: CanvasPatternRepetition
}

const manifest = JSON.parse(manifestSource) as Record<string, TextureInfo>

export type TextureKey = keyof typeof manifest
const records = new Map<TextureKey, TextureRecord>()

const ensureRecord = (key: TextureKey): TextureRecord => {
  const existing = records.get(key)
  if (existing) {
    return existing
  }

  const info = manifest[key]
  if (!info) {
    throw new Error(`Texture manifest is missing entry for key "${key}"`)
  }

  const record: TextureRecord = { info }
  records.set(key, record)
  return record
}

const startLoading = (key: TextureKey): void => {
  const record = ensureRecord(key)
  if (record.image || record.promise || record.error) {
    return
  }

  if (typeof Image === 'undefined') {
    record.error = new Error('Image constructor is not available in this environment')
    return
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      record.image = image
      resolve(image)
    }
    image.onerror = (event) => {
      const isErrorEvent = typeof ErrorEvent !== 'undefined' && event instanceof ErrorEvent
      const error = isErrorEvent && event.error ? event.error : new Error(`Failed to load ${record.info.path}`)
      record.error = error
      reject(error)
    }
    image.src = record.info.path
  })

  promise.catch((error) => {
    record.error = error
    return undefined
  })

  record.promise = promise
}

export const getTextureInfo = (key: TextureKey): TextureInfo => {
  return ensureRecord(key).info
}

export const textureKeys = (): TextureKey[] => Object.keys(manifest) as TextureKey[]

export const primeTexture = (key: TextureKey): void => {
  startLoading(key)
}

export const getTextureImage = (key: TextureKey): HTMLImageElement | undefined => {
  const record = ensureRecord(key)
  if (record.image) {
    return record.image
  }
  startLoading(key)
  return undefined
}

export const getTexturePattern = (
  ctx: CanvasRenderingContext2D,
  key: TextureKey,
  options: PatternOptions = {}
): CanvasPattern | undefined => {
  const record = ensureRecord(key)
  if (!record.image) {
    startLoading(key)
    return undefined
  }

  const repetition = options.repetition ?? 'repeat'
  const pattern = ctx.createPattern(record.image, repetition)
  if (!pattern) {
    return undefined
  }

  const scale = record.info.scale ?? 1
  if (scale !== 1 && typeof (pattern as CanvasPattern & { setTransform?: (matrix: DOMMatrix2DInit) => void }).setTransform === 'function') {
    const matrix = new DOMMatrix()
    matrix.a = scale
    matrix.d = scale
    pattern.setTransform(matrix)
  }

  return pattern
}

export const getTextureError = (key: TextureKey): unknown => {
  return ensureRecord(key).error
}

export const getTextureManifest = (): Record<TextureKey, TextureInfo> => {
  return manifest as Record<TextureKey, TextureInfo>
}
