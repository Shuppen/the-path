export interface EqPreset {
  id: string
  label: string
  description?: string
  bands: {
    low: number
    mid: number
    high: number
  }
}

export const EQ_PRESETS: EqPreset[] = [
  {
    id: 'flat',
    label: 'Flat',
    description: 'Neutral curve without coloration — best for analysis or headphones.',
    bands: { low: 0, mid: 0, high: 0 },
  },
  {
    id: 'club',
    label: 'Club',
    description: 'Accentuated bass and air for high-energy electronic tracks.',
    bands: { low: 4.5, mid: -1, high: 3.5 },
  },
  {
    id: 'lofi',
    label: 'Lo-Fi',
    description: 'Rolled-off highs and mids for chill or retro aesthetics.',
    bands: { low: -1.5, mid: -2, high: -5 },
  },
  {
    id: 'focus',
    label: 'Focus',
    description: 'Slight mid push to keep melodies forward while trimming rumble.',
    bands: { low: -1, mid: 2.5, high: 1.5 },
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    description: 'Bright top-end shimmer with restrained mids.',
    bands: { low: 1, mid: -0.5, high: 4.5 },
  },
]

export const getEqPresetById = (id: string): EqPreset | undefined =>
  EQ_PRESETS.find((preset) => preset.id === id)
