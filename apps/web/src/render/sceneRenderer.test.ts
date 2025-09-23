import { describe, expect, it, vi } from 'vitest'

import type { WorldState } from '../world'
import { SceneRenderer } from './sceneRenderer'

const MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

const setupMatchMedia = (initial: boolean) => {
  const original = window.matchMedia
  let current = initial
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  const createEvent = (value: boolean): MediaQueryListEvent =>
    ({ matches: value, media: MEDIA_QUERY } as MediaQueryListEvent)

  const createMediaQueryList = (): MediaQueryList => {
    const mediaQueryList: Partial<MediaQueryList> = {
      media: MEDIA_QUERY,
      onchange: null,
      addEventListener: (_event: 'change', listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          listeners.add(listener as (event: MediaQueryListEvent) => void)
        }
      },
      removeEventListener: (_event: 'change', listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          listeners.delete(listener as (event: MediaQueryListEvent) => void)
        }
      },
      addListener: (listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null) => {
        if (typeof listener === 'function') {
          listeners.add(listener as (event: MediaQueryListEvent) => void)
        }
      },
      removeListener: (listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null) => {
        if (typeof listener === 'function') {
          listeners.delete(listener as (event: MediaQueryListEvent) => void)
        }
      },
      dispatchEvent: (event: Event) => {
        listeners.forEach((listener) => listener(event as MediaQueryListEvent))
        return true
      },
    }

    Object.defineProperty(mediaQueryList, 'matches', {
      get: () => current,
    })

    return mediaQueryList as MediaQueryList
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(createMediaQueryList),
  })

  return {
    setMatches: (value: boolean) => {
      current = value
      const event = createEvent(value)
      listeners.forEach((listener) => listener(event))
    },
    restore: () => {
      if (original) {
        window.matchMedia = original
      } else {
        delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia
      }
    },
  }
}

const createMockContext = (): CanvasRenderingContext2D => {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600

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
    translate: vi.fn(),
    restore: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    fillText: vi.fn(),
  }

  ;(context as { fillStyle: unknown }).fillStyle = ''
  ;(context as { strokeStyle: unknown }).strokeStyle = ''
  ;(context as { lineWidth: number }).lineWidth = 0
  ;(context as { font: string }).font = ''
  ;(context as { textAlign: CanvasTextAlign }).textAlign = 'left'
  ;(context as { textBaseline: CanvasTextBaseline }).textBaseline = 'alphabetic'
  ;(context as { globalAlpha: number }).globalAlpha = 1

  return context as CanvasRenderingContext2D
}

const createState = (): WorldState => ({
  seed: 'test',
  time: 1,
  beat: 0,
  status: 'running',
  stage: { width: 800, height: 600, groundHeight: 100, groundY: 500 },
  player: {
    position: { x: 100, y: 400 },
    velocity: { x: 0, y: 0 },
    width: 40,
    height: 60,
    onGround: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    alive: true,
  },
  obstacles: [],
  flashes: [],
  score: 0,
  combo: 0,
  bestCombo: 0,
})

describe('SceneRenderer reduced motion', () => {
  it('uses animated sine waves when reduced motion is off', () => {
    const controls = setupMatchMedia(false)
    const sinSpy = vi.spyOn(Math, 'sin')
    const cosSpy = vi.spyOn(Math, 'cos')

    const renderer = new SceneRenderer(createMockContext())
    try {
      renderer.render(createState())

      expect(sinSpy).toHaveBeenCalled()
      expect(cosSpy).toHaveBeenCalled()
    } finally {
      renderer.dispose()
      controls.restore()
      vi.restoreAllMocks()
    }
  })

  it('skips sine-based animations when reduced motion is preferred', () => {
    const controls = setupMatchMedia(true)
    const sinSpy = vi.spyOn(Math, 'sin')
    const cosSpy = vi.spyOn(Math, 'cos')

    const renderer = new SceneRenderer(createMockContext())
    try {
      renderer.render(createState())

      expect(sinSpy).not.toHaveBeenCalled()
      expect(cosSpy).not.toHaveBeenCalled()
    } finally {
      renderer.dispose()
      controls.restore()
      vi.restoreAllMocks()
    }
  })
})
