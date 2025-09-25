import { describe, expect, it, vi } from 'vitest'

import type { LaneNote, WorldState } from '../world'

const operations: string[] = []

const record = (value: string) => {
  operations.push(value)
}

vi.mock('../environment/reducedMotion', () => ({
  subscribeToReducedMotion: vi.fn((listener: (value: boolean) => void) => {
    listener(false)
    return () => {}
  }),
}))

const createGradient = (kind: 'linear' | 'radial', coords: number[]) => {
  const gradient = {
    addColorStop: vi.fn((offset: number, color: string) => {
      record(`${kind}-stop ${offset.toFixed(2)} ${color}`)
    }),
  }
  record(`${kind}-gradient ${coords.map((value) => value.toFixed(1)).join(',')}`)
  return gradient as unknown as CanvasGradient
}

const createRecordingContext = (): CanvasRenderingContext2D => {
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 1280

  const context: Partial<CanvasRenderingContext2D> = {
    canvas,
    clearRect: (x: number, y: number, w: number, h: number) => record(`clearRect ${x} ${y} ${w} ${h}`),
    createLinearGradient: (...coords: number[]) => createGradient('linear', coords),
    createRadialGradient: (...coords: number[]) => createGradient('radial', coords),
    fillRect: (x: number, y: number, w: number, h: number) =>
      record(`fillRect ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} style=${currentFill}`),
    beginPath: () => record('beginPath'),
    moveTo: (x: number, y: number) => record(`moveTo ${x.toFixed(1)} ${y.toFixed(1)}`),
    lineTo: (x: number, y: number) => record(`lineTo ${x.toFixed(1)} ${y.toFixed(1)}`),
    quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) =>
      record(
        `quadraticCurveTo ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} style=${currentFill}`,
      ),
    stroke: () => record(`stroke style=${currentStroke} width=${lineWidth.toFixed(1)}`),
    closePath: () => record('closePath'),
    fill: () => record(`fill style=${currentFill}`),
    save: () => record('save'),
    restore: () => record('restore'),
    arc: (x: number, y: number, radius: number) =>
      record(`arc ${x.toFixed(1)} ${y.toFixed(1)} ${radius.toFixed(1)} style=${currentFill} alpha=${globalAlpha.toFixed(2)}`),
    ellipse: (x: number, y: number, rx: number, ry: number) =>
      record(`ellipse ${x.toFixed(1)} ${y.toFixed(1)} ${rx.toFixed(1)} ${ry.toFixed(1)} style=${currentFill}`),
  }

  let currentFill = '#000'
  let currentStroke = '#000'
  let lineWidth = 1
  let globalAlpha = 1

  Object.defineProperty(context, 'fillStyle', {
    get: () => currentFill,
    set: (value) => {
      currentFill = String(value)
      record(`set fillStyle ${currentFill}`)
    },
  })

  Object.defineProperty(context, 'strokeStyle', {
    get: () => currentStroke,
    set: (value) => {
      currentStroke = String(value)
      record(`set strokeStyle ${currentStroke}`)
    },
  })

  Object.defineProperty(context, 'lineWidth', {
    get: () => lineWidth,
    set: (value) => {
      lineWidth = value
      record(`set lineWidth ${lineWidth.toFixed(1)}`)
    },
  })

  Object.defineProperty(context, 'globalAlpha', {
    get: () => globalAlpha,
    set: (value) => {
      globalAlpha = value
      record(`set globalAlpha ${globalAlpha.toFixed(2)}`)
    },
  })

  return context as CanvasRenderingContext2D
}

const laneWidth = (720 - 48) / 4
const hitLineY = 1280 * (1 - 0.12 * 0.5)

let noteId = 0

const createNote = (overrides: Partial<LaneNote>): LaneNote => ({
  id: overrides.id ?? (noteId += 1),
  lane: overrides.lane ?? 0,
  time: overrides.time ?? 0,
  judged: overrides.judged ?? false,
  judgement: overrides.judgement,
  hitTime: overrides.hitTime,
})

const createState = (): WorldState => {
  // ensure deterministic ids for each state instantiation
  noteId = 0
  return {
    seed: 'visual',
    time: 42.4,
    beat: 120,
    status: 'running',
    stage: {
      width: 720,
      height: 1280,
      hitLineY,
      laneWidth,
      lanePadding: 24,
      laneCount: 4,
      scrollSpeed: 720,
    },
    lanes: { count: 4 },
    notes: [
      createNote({ id: 1, lane: 0, time: 42.65 }),
      createNote({ id: 2, lane: 1, time: 42.36, judged: true, judgement: 'perfect', hitTime: 42.36 }),
      createNote({ id: 3, lane: 2, time: 41.98 }),
    ],
    runner: {
      lane: 1,
      targetLane: 2,
      transitionFrom: 1,
      transitionStart: 42.2,
      transitionDuration: 0.15,
      combo: 18,
      bestCombo: 30,
      score: 98200,
      perfectHits: 40,
      goodHits: 6,
      missHits: 2,
    },
    feedback: [
      { id: 1, judgement: 'perfect', createdAt: 42.1, x: 24 + laneWidth * 1.5, y: hitLineY },
      { id: 2, judgement: 'miss', createdAt: 41.9, x: 24 + laneWidth * 2.5, y: hitLineY },
    ],
    accuracy: 0.94,
  }
}

const { SceneRenderer } = await import('./sceneRenderer')

describe('SceneRenderer visual output', () => {
  it('records drawing operations for snapshot comparison', () => {
    operations.length = 0
    const ctx = createRecordingContext()
    const renderer = new SceneRenderer(ctx)

    renderer.render(createState())

    expect(operations).toMatchSnapshot()
  })
})
