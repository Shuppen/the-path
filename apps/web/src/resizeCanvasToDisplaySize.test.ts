import { describe, expect, it } from 'vitest'

import { resizeCanvasToDisplaySize } from '@the-path/utils'
import type { ViewportMetrics } from '@the-path/types'

describe('resizeCanvasToDisplaySize', () => {
  it('scales canvas dimensions using the provided device pixel ratio', () => {
    const canvas = document.createElement('canvas')
    const metrics: ViewportMetrics = {
      width: 360,
      height: 202.5,
      devicePixelRatio: 2,
    }

    resizeCanvasToDisplaySize(canvas, metrics)

    expect(canvas.width).toBe(720)
    expect(canvas.height).toBe(405)
  })

  it('does not mutate the canvas when dimensions are already up to date', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 405

    const metrics: ViewportMetrics = {
      width: 360,
      height: 202.5,
      devicePixelRatio: 2,
    }

    resizeCanvasToDisplaySize(canvas, metrics)

    expect(canvas.width).toBe(720)
    expect(canvas.height).toBe(405)
  })
})
