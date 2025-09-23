import type { Vector2 } from '@the-path/types'

export type WorldStatus = 'running' | 'gameover'

export interface StageMetrics {
  width: number
  height: number
  groundY: number
  groundHeight: number
}

export interface PlayerState {
  position: Vector2
  velocity: Vector2
  width: number
  height: number
  onGround: boolean
  coyoteTimer: number
  jumpBufferTimer: number
  alive: boolean
}

export type ObstacleKind = 'pulse' | 'spire' | 'block'

export interface ObstacleState {
  id: number
  kind: ObstacleKind
  position: Vector2
  width: number
  height: number
  speedFactor: number
  passed: boolean
  beatIndex: number
}

export interface FlashEffect {
  id: number
  position: Vector2
  radius: number
  life: number
  age: number
  strength: number
}

export interface WorldState {
  seed: string
  time: number
  beat: number
  status: WorldStatus
  stage: StageMetrics
  player: PlayerState
  obstacles: ObstacleState[]
  flashes: FlashEffect[]
  score: number
  combo: number
  bestCombo: number
  pointer?: Vector2
}

export interface WorldSnapshot {
  score: number
  combo: number
  bestCombo: number
  status: WorldStatus
  seed: string
  sessionBestScore: number
  personalBestScore: number
}
