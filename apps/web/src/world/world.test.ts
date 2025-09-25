import { describe, expect, it } from 'vitest'

import { GOOD_WINDOW, PERFECT_WINDOW } from './constants'
import type { LaneNote } from './types'
import { World } from './world'

const createWorld = () => {
  noteCounter = 0
  const world = new World({ seed: 'test-seed', width: 720, height: 1280 })
  world.state.status = 'running'
  world.state.time = 1
  world.state.runner.lane = 1
  world.state.runner.targetLane = 1
  world.state.runner.position = 1
  ;(world as unknown as { generator: { update: (state: unknown, lead: number) => void } }).generator.update = () => {}
  return world
}

let noteCounter = 0

const insertNote = (world: World, overrides: Partial<LaneNote> = {}): LaneNote => {
  const note: LaneNote = {
    id: (noteCounter += 1),
    lane: overrides.lane ?? 1,
    time: overrides.time ?? world.state.time,
    kind: overrides.kind ?? 'tap',
    judged: overrides.judged ?? false,
    judgement: overrides.judgement,
    hitTime: overrides.hitTime,
  }
  world.state.notes.push(note)
  return note
}

describe('World note judgement', () => {
  it('awards a perfect hit within the perfect timing window', () => {
    const world = createWorld()
    const note = insertNote(world)

    world.update({ dt: 0, frame: { tapLane: note.lane, swipe: 0 } })

    expect(note.judged).toBe(true)
    expect(note.judgement).toBe('perfect')
    expect(world.state.runner.perfectHits).toBe(1)
    expect(world.state.runner.combo).toBe(1)
    expect(world.state.comboMultiplier).toBeGreaterThanOrEqual(1)
  })

  it('awards a good hit when slightly outside the perfect window', () => {
    const world = createWorld()
    const note = insertNote(world, { time: world.state.time - (PERFECT_WINDOW + 0.02) })

    world.update({ dt: 0, frame: { tapLane: note.lane, swipe: 0 } })

    expect(note.judged).toBe(true)
    expect(note.judgement).toBe('good')
    expect(world.state.runner.goodHits).toBe(1)
    expect(world.state.runner.combo).toBe(1)
  })

  it('registers a miss when tapping after the good window', () => {
    const world = createWorld()
    const note = insertNote(world, { time: world.state.time - (GOOD_WINDOW + 0.05) })

    world.update({ dt: 0, frame: { tapLane: note.lane, swipe: 0 } })

    expect(note.judged).toBe(true)
    expect(note.judgement).toBe('miss')
    expect(world.state.runner.missHits).toBe(1)
    expect(world.state.runner.combo).toBe(0)
  })
})

describe('World lane switching', () => {
  it('moves the runner left and clamps to lane bounds', () => {
    const world = createWorld()
    world.state.runner.targetLane = 0
    world.state.runner.lane = 0

    world.update({ dt: 0, frame: { tapLane: null, swipe: -1 } })

    expect(world.state.runner.targetLane).toBe(0)
    expect(world.state.runner.transitionDuration).toBe(0)
    expect(world.state.runner.position).toBe(0)
  })

  it('moves the runner right with an eased transition', () => {
    const world = createWorld()

    world.update({ dt: 0, frame: { tapLane: null, swipe: 1 } })

    expect(world.state.runner.targetLane).toBe(2)
    expect(world.state.runner.transitionFrom).toBe(1)
    expect(world.state.runner.transitionDuration).toBeGreaterThan(0)
    expect(world.state.runner.position).toBeCloseTo(1)
  })
})

describe('World e2e note flow', () => {
  it('handles three notes with two perfect hits and one good', () => {
    const world = createWorld()
    const now = world.state.time
    const noteA = insertNote(world, { time: now })
    const noteB = insertNote(world, { time: now + 0.1 })
    const noteC = insertNote(world, { time: now + 0.2 })

    world.update({ dt: 0, frame: { tapLane: noteA.lane, swipe: 0 } })
    world.update({ dt: 0.1, frame: { tapLane: noteB.lane, swipe: 0 } })
    const goodHitTime = noteC.time + PERFECT_WINDOW + (GOOD_WINDOW - PERFECT_WINDOW) * 0.5
    world.state.time = goodHitTime
    world.update({ dt: 0, frame: { tapLane: noteC.lane, swipe: 0 } })

    expect(noteA.judgement).toBe('perfect')
    expect(noteB.judgement).toBe('perfect')
    expect(noteC.judgement).toBe('good')
    expect(world.state.runner.perfectHits).toBe(2)
    expect(world.state.runner.goodHits).toBe(1)
    expect(world.state.runner.combo).toBe(3)
  })
})
