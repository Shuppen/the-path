import type { Vector2 } from '@the-path/types'
import {
  PLAYER_COYOTE_TIME,
  PLAYER_GRAVITY,
  PLAYER_HEIGHT,
  PLAYER_JUMP_BUFFER,
  PLAYER_JUMP_HOLD_GRAVITY_SCALE,
  PLAYER_JUMP_HOLD_MAX_DURATION,
  PLAYER_JUMP_VELOCITY,
  PLAYER_MAX_FALL_SPEED,
  PLAYER_WIDTH,
  PLAYER_X,
} from './constants'
import type { PlayerState, StageMetrics } from './types'

export interface PlayerUpdateInput {
  jumpRequested: boolean
  jumpHoldDuration: number
  stage: StageMetrics
  dt: number
}

export interface PlayerUpdateResult {
  jumped: boolean
  landed: boolean
}

export const createInitialPlayer = (stage: StageMetrics): PlayerState => ({
  position: { x: PLAYER_X, y: stage.groundY - PLAYER_HEIGHT },
  velocity: { x: 0, y: 0 },
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  onGround: true,
  coyoteTimer: PLAYER_COYOTE_TIME,
  jumpBufferTimer: 0,
  alive: true,
})

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const performJump = (player: PlayerState) => {
  player.velocity.y = PLAYER_JUMP_VELOCITY
  player.onGround = false
  player.coyoteTimer = 0
  player.jumpBufferTimer = 0
}

export const updatePlayer = (
  player: PlayerState,
  input: PlayerUpdateInput
): PlayerUpdateResult => {
  const { jumpRequested, jumpHoldDuration, stage, dt } = input
  let jumped = false
  let landed = false

  if (jumpRequested) {
    player.jumpBufferTimer = PLAYER_JUMP_BUFFER
  }

  if (player.onGround) {
    player.coyoteTimer = PLAYER_COYOTE_TIME
  } else if (player.coyoteTimer > 0) {
    player.coyoteTimer = Math.max(0, player.coyoteTimer - dt)
  }

  if (player.jumpBufferTimer > 0) {
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt)
  }

  const canJump = player.onGround || player.coyoteTimer > 0
  if (canJump && player.jumpBufferTimer > 0) {
    performJump(player)
    jumped = true
  }

  const holdActive =
    jumpHoldDuration > 0 &&
    jumpHoldDuration <= PLAYER_JUMP_HOLD_MAX_DURATION &&
    player.velocity.y < 0

  const gravityMultiplier = holdActive ? PLAYER_JUMP_HOLD_GRAVITY_SCALE : 1

  player.velocity.y = clamp(
    player.velocity.y + PLAYER_GRAVITY * gravityMultiplier * dt,
    PLAYER_JUMP_VELOCITY,
    PLAYER_MAX_FALL_SPEED
  )

  const nextPosition: Vector2 = {
    x: PLAYER_X,
    y: player.position.y + player.velocity.y * dt,
  }

  const groundY = stage.groundY - player.height
  if (nextPosition.y >= groundY) {
    nextPosition.y = groundY
    if (!player.onGround) {
      landed = true
    }
    player.onGround = true
    player.velocity.y = 0
  } else {
    player.onGround = false
  }

  player.position = nextPosition

  return { jumped, landed }
}
