import { statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import manifestSource from '../../public/textures/manifest.json?raw'

type ManifestEntry = {
  path: string
  scale?: number
  palette: string[]
}

const manifest = JSON.parse(manifestSource) as Record<string, ManifestEntry>
const publicDir = resolve(process.cwd(), 'public')

describe('texture manifest', () => {
  it('stays within the texture budget and documents assets', () => {
    const entries = Object.entries(manifest).map(([key, info]) => {
      const relative = info.path.startsWith('/') ? info.path.slice(1) : info.path
      const filePath = resolve(publicDir, relative)
      const bytes = statSync(filePath).size
      return {
        key,
        path: info.path,
        scale: info.scale ?? 1,
        palette: info.palette,
        bytes,
      }
    })

    const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)

    expect(totalBytes).toBeLessThanOrEqual(2 * 1024 * 1024)
    expect({ totalBytes, entries }).toMatchInlineSnapshot(`
      {
        "entries": [
          {
            "bytes": 1686,
            "key": "background",
            "palette": [
              "#020617",
              "#0ea5e9",
              "#14b8a6",
              "#bae6fd",
            ],
            "path": "/textures/background-nebula.svg",
            "scale": 0.85,
          },
          {
            "bytes": 707,
            "key": "ground",
            "palette": [
              "#05202d",
              "#0f766e",
              "#38bdf8",
              "#0b1120",
            ],
            "path": "/textures/ground-strata.svg",
            "scale": 0.6,
          },
          {
            "bytes": 901,
            "key": "obstacle-spire",
            "palette": [
              "#f472b6",
              "#be185d",
              "#4c1d95",
            ],
            "path": "/textures/obstacle-spire.svg",
            "scale": 0.7,
          },
          {
            "bytes": 1180,
            "key": "obstacle-pulse",
            "palette": [
              "#38bdf8",
              "#0ea5e9",
              "#0b4a6f",
            ],
            "path": "/textures/obstacle-pulse.svg",
            "scale": 0.7,
          },
          {
            "bytes": 972,
            "key": "obstacle-block",
            "palette": [
              "#93c5fd",
              "#3b82f6",
              "#1d4ed8",
            ],
            "path": "/textures/obstacle-block.svg",
            "scale": 0.7,
          },
          {
            "bytes": 1801,
            "key": "player",
            "palette": [
              "#10b981",
              "#0f766e",
              "#e2e8f0",
              "#5eead4",
            ],
            "path": "/textures/player-suit.svg",
            "scale": 1,
          },
        ],
        "totalBytes": 7247,
      }
    `)
  })
})
