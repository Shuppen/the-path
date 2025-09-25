import type { Config } from 'tailwindcss'

export default {
  content: ['index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          cyan: '#38bdf8',
          slate: '#0f172a',
          violet: '#7c3aed',
        },
        surface: {
          base: '#020617',
          sunken: '#040b1a',
          raised: '#0b1224',
          overlay: '#111b2f',
        },
        accent: {
          cyan: '#22d3ee',
          magenta: '#c084fc',
          amber: '#fbbf24',
        },
        border: {
          subtle: 'rgba(148, 163, 184, 0.18)',
          strong: 'rgba(148, 163, 184, 0.28)',
        },
      },
      boxShadow: {
        focus: '0 0 0 4px rgba(56, 189, 248, 0.35)',
        glow: '0 0 0 1px rgba(56, 189, 248, 0.25), 0 20px 50px rgba(8, 47, 73, 0.55)',
        panel: '0 25px 60px rgba(8, 47, 73, 0.35)',
      },
      ringColor: {
        focus: 'rgba(56, 189, 248, 0.45)',
      },
      ringOffsetColor: {
        surface: '#020617',
        'surface-base': '#020617',
      },
      aspectRatio: {
        'hero-video': '16 / 9',
        'hero-video-wide': '18 / 9',
      },
      backgroundImage: {
        'mesh-grid':
          'radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.18), transparent 55%), radial-gradient(circle at 80% 15%, rgba(124, 58, 237, 0.18), transparent 60%), radial-gradient(circle at 10% 80%, rgba(34, 211, 238, 0.14), transparent 55%)',
      },
    },
  },
  plugins: [],
} satisfies Config
