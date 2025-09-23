import { TRACK_DATA_URIS } from './data'

export interface AudioTrackManifestEntry {
  id: string
  title: string
  artist: string
  src?: string
  duration: number
  bpm: number
  description?: string
}

export const TRACK_MANIFEST: AudioTrackManifestEntry[] = [
  {
    id: 'bright-beats',
    title: 'Bright Beats',
    artist: 'Sine Architect',
    src: TRACK_DATA_URIS['bright_beats'],
    duration: 8,
    bpm: 105,
    description: 'Upbeat pulses rendered procedurally for responsive motion.',
  },
  {
    id: 'smooth-rush',
    title: 'Smooth Rush',
    artist: 'Harmonic Relay',
    src: TRACK_DATA_URIS['smooth_rush'],
    duration: 10.5,
    bpm: 112,
    description: 'Layered swells that accelerate into steady percussion.',
  },
  {
    id: 'percussive-drive',
    title: 'Percussive Drive',
    artist: 'Square Wave Unit',
    src: TRACK_DATA_URIS['percussive_drive'],
    duration: 9.5,
    bpm: 98,
    description: 'Minimal percussive hits carved from synthesized transients.',
  },
]

export const DEFAULT_TRACK_ID = TRACK_MANIFEST[0]?.id ?? 'bright-beats'

export const getTrackById = (id: string): AudioTrackManifestEntry | undefined =>
  TRACK_MANIFEST.find((entry) => entry.id === id)
