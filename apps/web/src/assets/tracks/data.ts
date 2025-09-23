export interface TrackMetadata {
  readonly duration: number
  readonly bpm: number
}

export interface TrackDetails {
  readonly title: string
  readonly artist: string
  readonly description?: string
}

export const TRACK_METADATA = {
  'bright-beats': { duration: 8, bpm: 105 },
  'smooth-rush': { duration: 10.5, bpm: 112 },
  'percussive-drive': { duration: 9.5, bpm: 98 },
} as const satisfies Record<string, TrackMetadata>

export const TRACK_DETAILS = {
  'bright-beats': {
    title: 'Bright Beats',
    artist: 'Sine Architect',
    description: 'Upbeat pulses rendered procedurally for responsive motion.',
  },
  'smooth-rush': {
    title: 'Smooth Rush',
    artist: 'Harmonic Relay',
    description: 'Layered swells that accelerate into steady percussion.',
  },
  'percussive-drive': {
    title: 'Percussive Drive',
    artist: 'Square Wave Unit',
    description: 'Minimal percussive hits carved from synthesized transients.',
  },
} as const satisfies Record<string, TrackDetails>

export const TRACK_ORDER = ['bright-beats', 'smooth-rush', 'percussive-drive'] as const satisfies readonly string[]
