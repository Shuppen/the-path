import type { Config } from 'tailwindcss'

export default {
  content: ['index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          cyan: '#38bdf8',
          slate: '#0f172a',
        },
      },
      boxShadow: {
        focus: '0 0 0 4px rgba(56, 189, 248, 0.35)',
      },
      aspectRatio: {
        'hero-video': '16 / 9',
        'hero-video-wide': '18 / 9',
      },
    },
  },
  plugins: [],
} satisfies Config
