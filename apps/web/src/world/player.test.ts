import { describe, expect, it } from 'vitest'

import { createInitialPlayer, updatePlayer } from './player'
import type { StageMetrics } from './types'

const createStage = (): StageMetrics => ({
  width: 800,
  height: 600,
  groundHeight: 120,
  groundY: 480,
})

const DT = 1 / 60
const TOTAL_STEPS = 60

const simulateJump = (holdFrames: number) => {
  const stage = createStage()
  const player = createInitialPlayer(stage)
  let currentHold = 0
  let minY = player.position.y

  for (let step = 0; step < TOTAL_STEPS; step += 1) {
    const jumpRequested = step === 0
    if (step < holdFrames) {
      currentHold += DT
    } else {
      currentHold = 0
    }

    updatePlayer(player, {
      jumpRequested,
      jumpHoldDuration: currentHold,
      stage,
      dt: DT,
    })

    minY = Math.min(minY, player.position.y)
  }

  return { minY }
}

describe('updatePlayer jump hold', () => {
  it('keeps the player in the air longer when the jump is held', () => {
    const shortHold = simulateJump(1)
    const longHold = simulateJump(6)

    expect(longHold.minY).toBeLessThan(shortHold.minY)
  })
})

