import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import type { WorldState } from '../world'
import { SceneRenderer } from './sceneRenderer'

const unsubscribe = vi.fn()
const listeners = new Set<(value: boolean) => void>()

vi.mock('../environment/reducedMotion', () => ({
  subscribeToReducedMotion: vi.fn((listener: (value: boolean) => void) => {
    listeners.add(listener)
    listener(false)
    return () => {
      listeners.delete(listener)
      unsubscribe()
    }
  }),
}))

const createMockContext = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 1280

  const gradient = { addColorStop: vi.fn() }

  const context: Partial<CanvasRenderingContext2D> = {
    canvas,
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => gradient as unknown as CanvasGradient),
    createRadialGradient: vi.fn(() => gradient as unknown as CanvasGradient),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
  }

  ;(context as { fillStyle: unknown }).fillStyle = ''
  ;(context as { strokeStyle: unknown }).strokeStyle = ''
  ;(context as { lineWidth: number }).lineWidth = 0
  ;(context as { globalAlpha: number }).globalAlpha = 1

  return context as CanvasRenderingContext2D
}

const createState = (): WorldState => ({
  seed: 'state',
  time: 12,
  beat: 48,
  status: 'running',
  stage: {
    width: 720,
    height: 1280,
    hitLineY: 1280 * 0.88,
    laneWidth: (720 - 48) / 4,
    lanePadding: 24,
    laneCount: 4,
    scrollSpeed: 720,
  },
  lanes: { count: 4 },
  notes: [],
  runner: {
    lane: 1,
    targetLane: 1,
    transitionFrom: 1,
    transitionStart: 11.5,
    transitionDuration: 0,
    combo: 8,
    bestCombo: 12,
    score: 4200,
    perfectHits: 20,
    goodHits: 4,
    missHits: 1,
  },
  feedback: [],
  accuracy: 0.97,
})

afterEach(() => {
  unsubscribe.mockClear()
  listeners.clear()
})

describe('SceneRenderer', () => {
  it('draws lanes and hitbar for the current stage', () => {
    const ctx = createMockContext()
    const renderer = new SceneRenderer(ctx)

    const state = createState()

    renderer.render(state)

    const fillRectMock = ctx.fillRect as unknown as Mock<[number, number, number, number]>
    const laneFillCalls = fillRectMock.mock.calls.filter((call) => Math.abs(call[2] - state.stage.laneWidth) < 0.5)
    expect(laneFillCalls).toHaveLength(4)
    const { stage } = state
    laneFillCalls.forEach((call, index) => {
      const expectedX = stage.lanePadding + stage.laneWidth * index
      expect(call[0]).toBeCloseTo(expectedX)
      expect(call[1]).toBe(0)
      expect(call[2]).toBeCloseTo(stage.laneWidth)
    })

    const hitbarY = stage.height - stage.height * 0.12
    const hitbarCall = fillRectMock.mock.calls.find((call) => Math.abs(call[1] - hitbarY) < 0.5)
    expect(hitbarCall).toBeDefined()

    renderer.dispose()
  })

  it('unsubscribes from reduced motion listeners on dispose', () => {
    const ctx = createMockContext()
    const renderer = new SceneRenderer(ctx)

    renderer.dispose()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })
})
