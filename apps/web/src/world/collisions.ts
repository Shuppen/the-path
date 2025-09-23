import type { ObstacleState, PlayerState } from './types'

export const intersects = (player: PlayerState, obstacle: ObstacleState): boolean => {
  const px1 = player.position.x
  const py1 = player.position.y
  const px2 = px1 + player.width
  const py2 = py1 + player.height

  const ox1 = obstacle.position.x
  const oy1 = obstacle.position.y
  const ox2 = ox1 + obstacle.width
  const oy2 = oy1 + obstacle.height

  return px1 < ox2 && px2 > ox1 && py1 < oy2 && py2 > oy1
}
