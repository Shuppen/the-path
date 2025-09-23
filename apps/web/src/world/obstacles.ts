import { FLASH_LONG_LIFETIME, FLASH_LIFETIME, SCROLL_SPEED } from './constants'
import { intersects } from './collisions'
import type { FlashEffect, ObstacleState, PlayerState, WorldState } from './types'

export interface ObstacleUpdateResult {
  crashed: boolean
  scored: number
  comboIncreased: boolean
  newFlashes: FlashEffect[]
}

export const advanceObstacles = (
  obstacles: ObstacleState[],
  dt: number,
  stageWidth: number
): ObstacleState[] => {
  return obstacles
    .map((obstacle) => ({
      ...obstacle,
      position: {
        x: obstacle.position.x - SCROLL_SPEED * obstacle.speedFactor * dt,
        y: obstacle.position.y,
      },
    }))
    .filter((obstacle) => obstacle.position.x + obstacle.width > -stageWidth * 0.2)
}

export const evaluateObstacles = (
  world: WorldState,
  player: PlayerState
): ObstacleUpdateResult => {
  let crashed = false
  let scored = 0
  let comboIncreased = false
  const newFlashes: FlashEffect[] = []

  for (const obstacle of world.obstacles) {
    if (!obstacle.passed && obstacle.position.x + obstacle.width < player.position.x) {
      obstacle.passed = true
      scored += 150 + Math.floor(world.combo * 35)
      comboIncreased = true
      newFlashes.push({
        id: -1,
        position: {
          x: obstacle.position.x + obstacle.width * 0.5,
          y: obstacle.position.y + obstacle.height * 0.5,
        },
        radius: obstacle.width * 1.2,
        life: FLASH_LONG_LIFETIME,
        age: 0,
        strength: 0.85,
      })
    }

    if (!crashed && intersects(player, obstacle)) {
      crashed = true
      newFlashes.push({
        id: -1,
        position: {
          x: player.position.x + player.width * 0.5,
          y: player.position.y + player.height * 0.5,
        },
        radius: Math.max(player.width, player.height) * 2.2,
        life: FLASH_LIFETIME,
        age: 0,
        strength: 1.1,
      })
    }
  }

  return { crashed, scored, comboIncreased, newFlashes }
}
