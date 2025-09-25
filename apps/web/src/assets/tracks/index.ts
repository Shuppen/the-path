import {
  TRACK_DETAILS,
  TRACK_METADATA,
  TRACK_ORDER,
  type TrackDetails,
  type TrackMetadata,
} from './data'
import { PROCEDURAL_TRACKS } from './procedural'

export interface AudioTrackManifestEntry {
  id: string
  title: string
  artist: string
  src?: string
  duration: number
  bpm: number
  description?: string
}

const SUPPORTED_EXTENSIONS = ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav', 'webm'] as const

type AudioExtension = (typeof SUPPORTED_EXTENSIONS)[number]

const publicAssetGlob = import.meta.glob<string>(
  '/tracks/*.{aac,flac,m4a,mp3,ogg,opus,wav,webm}',
  { eager: true, import: 'default' },
)

const sourceAssetGlob = import.meta.glob<string>(
  './audio/*.{aac,flac,m4a,mp3,ogg,opus,wav,webm}',
  { eager: true, import: 'default' },
)

const TRACK_ASSET_URLS = { ...publicAssetGlob, ...sourceAssetGlob } as Record<string, string>

const SOURCE_PRIORITY: readonly AudioExtension[] = ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'webm', 'flac']

const isSupportedExtension = (value: string): value is AudioExtension =>
  (SUPPORTED_EXTENSIONS as readonly string[]).includes(value)

const slugify = (value: string): string => {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized
}

const deriveTitle = (baseName: string): string => {
  const cleaned = baseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) {
    return 'Untitled Track'
  }
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface TrackAssetEntry {
  readonly id: string
  readonly baseName: string
  readonly sources: Map<AudioExtension, string>
}

const collectTrackAssets = (): TrackAssetEntry[] => {
  const assets = new Map<string, TrackAssetEntry>()

  for (const [path, url] of Object.entries(TRACK_ASSET_URLS)) {
    const fileName = path.replace(/^\/tracks\//, '').replace(/^\.\/audio\//, '')
    const decodedFileName = decodeURIComponent(fileName)
    const lastDotIndex = decodedFileName.lastIndexOf('.')
    if (lastDotIndex === -1) continue

    const extension = decodedFileName.slice(lastDotIndex + 1).toLowerCase()
    if (!isSupportedExtension(extension)) continue

    const baseName = decodedFileName.slice(0, lastDotIndex)
    const id = slugify(baseName)
    if (!id) continue

    const existing = assets.get(id)
    if (existing) {
      existing.sources.set(extension, url)
      continue
    }

    assets.set(id, {
      id,
      baseName,
      sources: new Map([[extension, url]]),
    })
  }

  return Array.from(assets.values())
}

const pickPreferredSource = (sources: Map<AudioExtension, string>): string | null => {
  for (const extension of SOURCE_PRIORITY) {
    const candidate = sources.get(extension)
    if (candidate) {
      return candidate
    }
  }

  const iterator = sources.values().next()
  return iterator.done ? null : iterator.value
}

const metadataById = TRACK_METADATA as Record<string, TrackMetadata>
const detailsById = TRACK_DETAILS as Record<string, TrackDetails>
const preferredDefaultIds = TRACK_ORDER as readonly string[]

const buildTrackManifest = (): AudioTrackManifestEntry[] => {
  const manifest = new Map<string, AudioTrackManifestEntry>()

  const addEntry = (entry: AudioTrackManifestEntry) => {
    if (!manifest.has(entry.id)) {
      manifest.set(entry.id, entry)
    }
  }

  for (const asset of collectTrackAssets()) {
    const src = pickPreferredSource(asset.sources)
    if (!src) continue

    const metadata = metadataById[asset.id]
    const details = detailsById[asset.id]

    const entry: AudioTrackManifestEntry = {
      id: asset.id,
      title: details?.title ?? deriveTitle(asset.baseName),
      artist: details?.artist ?? 'Unknown Artist',
      duration: metadata?.duration ?? 0,
      bpm: metadata?.bpm ?? 0,
      src,
    }

    if (details?.description) {
      entry.description = details.description
    }

    addEntry(entry)
  }

  for (const track of PROCEDURAL_TRACKS) {
    const metadata = metadataById[track.id]
    const details = detailsById[track.id]

    const entry: AudioTrackManifestEntry = {
      id: track.id,
      title: details?.title ?? track.title,
      artist: details?.artist ?? track.artist,
      duration: metadata?.duration ?? track.duration,
      bpm: metadata?.bpm ?? track.bpm,
      src: track.src,
    }

    const description = details?.description ?? track.description
    if (description) {
      entry.description = description
    }

    addEntry(entry)
  }

  const orderWeight = (id: string): number => {
    const index = preferredDefaultIds.indexOf(id)
    return index === -1 ? preferredDefaultIds.length : index
  }

  const manifestEntries = Array.from(manifest.values())
  manifestEntries.sort((a, b) => {
    const weightDelta = orderWeight(a.id) - orderWeight(b.id)
    if (weightDelta !== 0) {
      return weightDelta
    }

    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  })

  return manifestEntries
}

const manifest = buildTrackManifest()
const manifestLookup = new Map(manifest.map((entry) => [entry.id, entry] as const))

export const TRACK_MANIFEST = manifest

export const DEFAULT_TRACK_ID =
  preferredDefaultIds.find((id) => manifestLookup.has(id)) ??
  manifest[0]?.id ??
  preferredDefaultIds[0] ??
  'bright-beats'

export const getTrackById = (id: string): AudioTrackManifestEntry | undefined => manifestLookup.get(id)
