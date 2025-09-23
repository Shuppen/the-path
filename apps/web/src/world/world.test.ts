import { describe, expect, it } from 'vitest'

import { World } from './world'

const DT = 1 / 60
const TOTAL_STEPS = 60

const createWorld = () => {
  const world = new World({ seed: 'test', width: 800, height: 600 })
  ;(world as unknown as { generator: { update: () => void } }).generator.update = () => {}
  return world
}

const simulateWorldJump = (holdFrames: number) => {
  const world = createWorld()
  let currentHold = 0
  let minY = world.state.player.position.y

  for (let step = 0; step < TOTAL_STEPS; step += 1) {
    const jump = step === 0
    if (step < holdFrames) {
      currentHold += DT
    } else {
      currentHold = 0
    }

    world.update({
      jump,
      restart: false,
      dt: DT,
      jumpHoldDuration: currentHold,
    })

    minY = Math.min(minY, world.state.player.position.y)
  }

  return { minY }
}

describe('World jump hold', () => {
  it('results in a higher jump when held longer', () => {
    const shortHold = simulateWorldJump(1)
    const longHold = simulateWorldJump(6)

    expect(longHold.minY).toBeLessThan(shortHold.minY)
  })
})

