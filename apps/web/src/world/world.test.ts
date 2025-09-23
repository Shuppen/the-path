
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
import { World } from './world'

const baseObstacleResult = () => ({
  crashed: false,
  scored: 0,
  comboIncreased: false,
  newFlashes: [],
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
