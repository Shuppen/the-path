
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { advanceObstaclesMock, evaluateObstaclesMock } = vi.hoisted(() => ({
  advanceObstaclesMock: vi.fn(),
  evaluateObstaclesMock: vi.fn(),
}))

vi.mock('./obstacles', () => ({
  advanceObstacles: advanceObstaclesMock,
  evaluateObstacles: evaluateObstaclesMock,
}))

import { PERSONAL_BEST_STORAGE_KEY } from './personalBest'
import type { ObstacleState } from './types'
import { World } from './world'

const baseObstacleResult = () => ({
  crashed: false,
  scored: 0,
  comboIncreased: false,
  newFlashes: [],
})

describe('World restart timeline control', () => {
  beforeEach(() => {
    advanceObstaclesMock.mockReset()
    evaluateObstaclesMock.mockReset()
    advanceObstaclesMock.mockImplementation((obstacles) => obstacles)
    evaluateObstaclesMock.mockImplementation(baseObstacleResult)
  })

  it('requests a timeline reset when restarting after a late crash', () => {
    let externalTime = 32.75
    const world = new World({ seed: 'late-run', width: 800, height: 600 })
    world.attachTimeSource(() => externalTime)

    const obstacle: ObstacleState = {
      id: 1,
      kind: 'pulse',
      position: { x: 180, y: 320 },
      width: 48,
      height: 64,
      speedFactor: 1,
      passed: false,
      beatIndex: 96,
    }

    world.state.status = 'gameover'
    world.state.time = externalTime
    world.state.player.alive = false
    world.state.obstacles = [obstacle]

    const requestReset = vi.fn(() => {
      externalTime = 0
    })

    world.update({
      dt: 0.016,
      jump: true,
      restart: false,
      jumpHoldDuration: 0,
      onRunRestart: requestReset,
    })

    expect(requestReset).toHaveBeenCalledTimes(1)
    expect(requestReset).toHaveBeenCalledWith({ reason: 'gameover', seed: 'late-run' })
    expect(world.state.status).toBe('running')
    expect(world.state.obstacles.length).toBe(0)

    world.update({ dt: 0.016, jump: false, restart: false, jumpHoldDuration: 0 })

    expect(externalTime).toBe(0)
    expect(world.state.time).toBe(0)
    expect(world.state.obstacles.length).toBe(0)
  })
})

describe('World personal best tracking', () => {
  beforeEach(() => {
    localStorage.clear()
    advanceObstaclesMock.mockReset()
    evaluateObstaclesMock.mockReset()
    advanceObstaclesMock.mockImplementation((obstacles) => obstacles)
    evaluateObstaclesMock.mockImplementation(baseObstacleResult)
  })

  it('persists the highest score across resets', () => {
    evaluateObstaclesMock
      .mockImplementationOnce(() => ({ ...baseObstacleResult(), scored: 250 }))
      .mockImplementationOnce(() => ({ ...baseObstacleResult(), crashed: true }))

    const world = new World({ seed: 'test', width: 800, height: 600 })

    world.update({ dt: 0.016, jump: false, restart: false, jumpHoldDuration: 0 })
    world.update({ dt: 0.016, jump: false, restart: false, jumpHoldDuration: 0 })

    const snapshot = world.snapshot()
    expect(snapshot.personalBestScore).toBe(250)
    expect(snapshot.sessionBestScore).toBe(250)

    const stored = JSON.parse(localStorage.getItem(PERSONAL_BEST_STORAGE_KEY) ?? '{}') as {
      score?: number
      updatedAt?: number
    }
    expect(stored.score).toBe(250)
    expect(typeof stored.updatedAt).toBe('number')

    world.reset()
    const afterReset = world.snapshot()
    expect(afterReset.personalBestScore).toBe(250)
    expect(afterReset.sessionBestScore).toBe(250)
  })

  it('loads a saved personal best when constructed', () => {
    localStorage.setItem(
      PERSONAL_BEST_STORAGE_KEY,
      JSON.stringify({ score: 4200, updatedAt: 1690000000000 }),
    )

    const world = new World({ seed: 'another', width: 640, height: 360 })
    const snapshot = world.snapshot()

    expect(snapshot.personalBestScore).toBe(4200)
    expect(snapshot.sessionBestScore).toBe(0)
  })
})

describe('World auto restart behaviour', () => {
  beforeEach(() => {
    localStorage.clear()
    advanceObstaclesMock.mockReset()
    evaluateObstaclesMock.mockReset()
  })

  it('clears obstacles when restarting after a late crash', () => {
    advanceObstaclesMock.mockImplementation((obstacles) => obstacles)
    let crashTriggered = false
    const targetTime = 33
    const dt = 1 / 60
    const steps = Math.ceil(targetTime * 60)
    let iterations = 0
    evaluateObstaclesMock.mockImplementation((state) => {
      iterations += 1
      if (!crashTriggered && (state.time >= targetTime || iterations >= steps)) {
        crashTriggered = true
        return { ...baseObstacleResult(), crashed: true }
      }
      return baseObstacleResult()
    })

    const world = new World({ seed: 'long-run', width: 800, height: 600 })
    let simulatedTime = 0
    world.attachTimeSource(() => simulatedTime)

    for (let i = 0; i < steps; i += 1) {
      simulatedTime += dt
      world.update({ dt, jump: false, restart: false, jumpHoldDuration: 0 })
    }

    expect(crashTriggered).toBe(true)
    expect(world.state.status).toBe('gameover')
    expect(world.state.obstacles.length).toBeGreaterThan(0)

    world.update({ dt, jump: true, restart: false, jumpHoldDuration: 0 })
    const pendingReset = world.consumePendingReset()
    expect(pendingReset).toBe(true)

    simulatedTime = 0
    simulatedTime += dt
    world.update({ dt, jump: false, restart: false, jumpHoldDuration: 0 })

    expect(world.state.status).toBe('running')
    expect(world.state.time).toBeCloseTo(simulatedTime, 3)
    expect(world.state.obstacles.length).toBe(0)
  })
})
