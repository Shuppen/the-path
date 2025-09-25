import { describe, expect, it, vi } from 'vitest'

import type { WorldState } from '../world'

const createPatternStub = (name: string) => ({
  __patternName: name,
  setTransform: vi.fn(),
}) as unknown as CanvasPattern & { __patternName: string }

const patternMap: Record<
  'background' | 'ground' | 'obstacle-spire' | 'obstacle-pulse' | 'obstacle-block',
  CanvasPattern & { __patternName: string }
> = {
  background: createPatternStub('background'),
  ground: createPatternStub('ground'),
  'obstacle-spire': createPatternStub('obstacle-spire'),
  'obstacle-pulse': createPatternStub('obstacle-pulse'),
  'obstacle-block': createPatternStub('obstacle-block'),
}

const playerImage = (() => {
  const image = document.createElement('img')
  image.width = 64
  image.height = 96
  return image
})()

vi.mock('./textures', () => ({
  __esModule: true,
  getTexturePattern: vi.fn(
    (_ctx: CanvasRenderingContext2D, key: keyof typeof patternMap) => patternMap[key] ?? undefined
  ),
  getTextureImage: vi.fn((key: string) => (key === 'player' ? playerImage : undefined)),
  primeTexture: vi.fn(),
}))

const describeFill = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const patternName = (value as { __patternName?: string }).__patternName
    if (patternName) {
      return `pattern:${patternName}`
    }

    const meta = (value as { __meta?: GradientMeta }).__meta
    if (meta) {
      const coords = meta.coords.map((coord) => Number(coord).toFixed(2)).join(',')
      const stops = meta.stops
        .map((stop) => `${stop.offset.toFixed(2)}:${stop.color}`)
        .join('|')
      return `gradient:${meta.kind}(${coords})[${stops}]`
    }
  }

  return 'unknown'
}

interface GradientMeta {
  kind: 'linear' | 'radial'
  coords: number[]
  stops: Array<{ offset: number; color: string }>
}

const createGradient = (kind: GradientMeta['kind'], coords: number[]) => {
  const meta: GradientMeta = {
    kind,
    coords,
    stops: [],
  }

  return {
    addColorStop(offset: number, color: string) {
      meta.stops.push({ offset, color })
    },
    __meta: meta,
  } as unknown as CanvasGradient & { __meta: GradientMeta }
}

const createRecordingContext = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600

  const operations: string[] = []

  const record = (value: string) => {
    operations.push(value)
  }

  let fillStyleValue: unknown
  let strokeStyleValue: unknown = 'black'
  let lineWidthValue = 1
  let globalAlphaValue = 1

  const context: Partial<CanvasRenderingContext2D> = {
    canvas,
    clearRect: (x: number, y: number, w: number, h: number) => record(`clearRect ${x} ${y} ${w} ${h}`),
    createLinearGradient: (...coords: number[]) => createGradient('linear', coords),
    createRadialGradient: (...coords: number[]) => createGradient('radial', coords),
    createPattern: vi.fn(() => null),
    fillRect: (x: number, y: number, w: number, h: number) =>
      record(`fillRect ${x} ${y} ${w} ${h} style=${describeFill(fillStyleValue)}`),
    beginPath: () => record('beginPath'),
    moveTo: (x: number, y: number) => record(`moveTo ${x} ${y}`),
    lineTo: (x: number, y: number) => record(`lineTo ${x} ${y}`),
    closePath: () => record('closePath'),
    stroke: () => record(`stroke style=${strokeStyleValue} width=${lineWidthValue}`),
    fill: () => record(`fill style=${describeFill(fillStyleValue)}`),
    save: () => record('save'),
    restore: () => record('restore'),
    translate: (x: number, y: number) => record(`translate ${x} ${y}`),
    arc: vi.fn(),
    ellipse: vi.fn(),
    roundRect: (x: number, y: number, w: number, h: number, r?: number) =>
      record(`roundRect ${x} ${y} ${w} ${h} ${r ?? 0}`),
    rect: (x: number, y: number, w: number, h: number) => record(`rect ${x} ${y} ${w} ${h}`),
    fillText: vi.fn(),
    drawImage: ((_image: CanvasImageSource, ...args: number[]) => {
      let dx = 0
      let dy = 0
      let dw = 0
      let dh = 0

      if (args.length === 2) {
        ;[dx, dy] = args
      } else if (args.length === 4) {
        ;[dx, dy, dw, dh] = args
      } else if (args.length >= 6) {
        dx = args[4] ?? 0
        dy = args[5] ?? 0
        dw = args[6] ?? 0
        dh = args[7] ?? 0
      }

      record(`drawImage ${dx} ${dy} ${dw} ${dh}`)
    }) as CanvasRenderingContext2D['drawImage'],
  }

  Object.defineProperty(context, 'fillStyle', {
    get: () => fillStyleValue,
    set: (value) => {
      fillStyleValue = value
      record(`set fillStyle ${describeFill(value)}`)
    },
  })

  Object.defineProperty(context, 'strokeStyle', {
    get: () => strokeStyleValue,
    set: (value) => {
      strokeStyleValue = value
      record(`set strokeStyle ${value}`)
    },
  })

  Object.defineProperty(context, 'lineWidth', {
    get: () => lineWidthValue,
    set: (value) => {
      lineWidthValue = value
      record(`set lineWidth ${value}`)
    },
  })

  Object.defineProperty(context, 'globalAlpha', {
    get: () => globalAlphaValue,
    set: (value) => {
      globalAlphaValue = value
      record(`set globalAlpha ${value}`)
    },
  })

  Object.defineProperty(context, 'font', {
    get: () => '',
    set: (value) => record(`set font ${value}`),
  })

  Object.defineProperty(context, 'textAlign', {
    get: () => 'left',
    set: (value) => record(`set textAlign ${value}`),
  })

  Object.defineProperty(context, 'textBaseline', {
    get: () => 'alphabetic',
    set: (value) => record(`set textBaseline ${value}`),
  })

  return { context: context as CanvasRenderingContext2D, operations }
}

const createStateWithTextures = (): WorldState => ({
  seed: 'visual',
  time: 0,
  beat: 0,
  status: 'running',
  stage: { width: 800, height: 600, groundHeight: 100, groundY: 500 },
  player: {
    position: { x: 120, y: 380 },
    velocity: { x: 0, y: 0 },
    width: 48,
    height: 72,
    onGround: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    alive: true,
  },
  obstacles: [
    {
      id: 1,
      kind: 'spire',
      position: { x: 240, y: 340 },
      width: 50,
      height: 120,
      speedFactor: 1,
      passed: false,
      beatIndex: 0,
    },
    {
      id: 2,
      kind: 'pulse',
      position: { x: 360, y: 360 },
      width: 60,
      height: 90,
      speedFactor: 1,
      passed: true,
      beatIndex: 1,
    },
    {
      id: 3,
      kind: 'block',
      position: { x: 500, y: 320 },
      width: 80,
      height: 140,
      speedFactor: 1,
      passed: false,
      beatIndex: 2,
    },
  ],
  flashes: [],
  score: 0,
  combo: 0,
  bestCombo: 0,
})

const { SceneRenderer } = await import('./sceneRenderer')

describe('SceneRenderer textures', () => {
  it('applies texture fills and sprite drawing when assets are available', () => {
    const { context, operations } = createRecordingContext()
    const renderer = new SceneRenderer(context)
    const state = createStateWithTextures()

    renderer.render(state)

    expect(operations).toMatchSnapshot()
  })
})
