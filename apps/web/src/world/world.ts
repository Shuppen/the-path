import type { Vector2 } from '@the-path/types'
import { createPrng, type Prng } from '../core/prng'
import {
  FLASH_LIFETIME,
  FLASH_LONG_LIFETIME,
  GROUND_HEIGHT_RATIO,
  MIN_GROUND_HEIGHT,
  PLAYER_X,
} from './constants'
import { BeatLevelGenerator, type BeatLevelGeneratorOptions } from './beatLevelGenerator'
import { advanceObstacles, evaluateObstacles } from './obstacles'
import { createInitialPlayer, updatePlayer } from './player'
import type { FlashEffect, StageMetrics, WorldSnapshot, WorldState } from './types'
import { readPersonalBest, updatePersonalBest, type PersonalBestRecord } from './personalBest'

const createStageMetrics = (width: number, height: number): StageMetrics => {
  const groundHeight = Math.max(height * GROUND_HEIGHT_RATIO, MIN_GROUND_HEIGHT)
  const groundY = height - groundHeight
  return { width, height, groundHeight, groundY }
}

const createBaseState = (seed: string, stage: StageMetrics): WorldState => ({
  seed,
  time: 0,
  beat: 0,
  status: 'running',
  stage,
  player: createInitialPlayer(stage),
  obstacles: [],
  flashes: [],
  score: 0,
  combo: 0,
  bestCombo: 0,
})

const cloneVector = (vector: Vector2): Vector2 => ({ x: vector.x, y: vector.y })

export interface WorldConfig {
  seed: string
  width: number
  height: number
}

export interface WorldUpdateInput {
  jump: boolean
  restart: boolean
  jumpHoldDuration: number
  pointer?: Vector2
  dt: number
  onRunRestart?: (event: { reason: 'manual' | 'gameover'; seed: string }) => void
}

export class World {
  public state: WorldState

  private baseSeed: string
  private prng: Prng
  private generator: BeatLevelGenerator
  private generatorOptions: BeatLevelGeneratorOptions
  private externalClock?: () => number | null
  private flashId = 0
  private sessionBestScore = 0
  private personalBest: PersonalBestRecord

  constructor(config: WorldConfig) {
    this.baseSeed = config.seed
    const stage = createStageMetrics(config.width, config.height)
    this.prng = createPrng(this.baseSeed)
    this.generatorOptions = {}
    this.generator = new BeatLevelGenerator(this.prng, this.generatorOptions)
    this.state = createBaseState(this.baseSeed, stage)
    this.personalBest = readPersonalBest()
  }

  setPointer(pointer?: Vector2): void {
    this.state.pointer = pointer ? cloneVector(pointer) : undefined
  }

  attachTimeSource(clock?: () => number | null): void {
    this.externalClock = clock
  }

  syncToBeat(time: number, confidence = 1): void {
    this.generator.syncToExternalBeat(time, confidence)
  }

  applyEnergySpike(intensity: number): void {
    this.generator.applyEnergySpike(intensity)
  }

  applyBreak(duration: number): void {
    this.generator.applyBreak(duration)
  }

  setViewport(width: number, height: number): void {
    const stage = createStageMetrics(width, height)
    this.state.stage = stage
    const player = this.state.player
    const maxX = stage.width - player.width * 1.5
    const minX = player.width * 0.5
    player.position.x = Math.min(Math.max(minX, PLAYER_X), Math.max(minX, maxX))
    const groundY = stage.groundY - player.height
    if (player.position.y > groundY) {
      player.position.y = groundY
      player.velocity.y = 0
      player.onGround = true
    }
    this.state.obstacles = this.state.obstacles.map((obstacle) => ({
      ...obstacle,
      position: { x: obstacle.position.x, y: stage.groundY - obstacle.height },
    }))
  }

  snapshot(): WorldSnapshot {
    return {
      score: Math.floor(this.state.score),
      combo: this.state.combo,
      bestCombo: this.state.bestCombo,
      status: this.state.status,
      seed: this.state.seed,
      sessionBestScore: this.sessionBestScore,
      personalBestScore: this.personalBest.score,
    }
  }

  update(input: WorldUpdateInput): void {
    this.setPointer(input.pointer)
    this.advanceFlashes(input.dt)

    if (input.restart) {
      input.onRunRestart?.({ reason: 'manual', seed: this.baseSeed })
      this.reset(this.baseSeed)
      return
    }

    if (this.state.status === 'gameover') {
      if (input.jump) {
        input.onRunRestart?.({ reason: 'gameover', seed: this.baseSeed })
        this.reset(this.baseSeed)
      }
      return
    }

    const externalTime = this.externalClock?.()
    if (typeof externalTime === 'number' && Number.isFinite(externalTime)) {
      if (externalTime >= 0) {
        this.state.time = externalTime
      }
    } else {
      this.state.time += input.dt
    }

    const playerResult = updatePlayer(this.state.player, {
      jumpRequested: input.jump,
      jumpHoldDuration: input.jumpHoldDuration,
      stage: this.state.stage,
      dt: input.dt,
    })

    if (playerResult.jumped) {
      this.addFlash({
        position: {
          x: this.state.player.position.x + this.state.player.width * 0.5,
          y: this.state.player.position.y + this.state.player.height * 0.5,
        },
        radius: this.state.player.width * 1.5,
        strength: 0.7,
        life: FLASH_LIFETIME,
      })
    }

    this.generator.update(this.state)

    this.state.obstacles = advanceObstacles(
      this.state.obstacles,
      input.dt,
      this.state.stage.width
    )

    const obstacleResult = evaluateObstacles(this.state, this.state.player)

    if (obstacleResult.scored > 0) {
      this.state.score += obstacleResult.scored
    }

    if (obstacleResult.comboIncreased) {
      this.state.combo += 1
      this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo)
    }

    for (const flash of obstacleResult.newFlashes) {
      this.addFlash({
        position: flash.position,
        radius: flash.radius,
        life: flash.life,
        strength: flash.strength,
      })
    }

    if (obstacleResult.crashed) {
      this.state.status = 'gameover'
      this.state.player.alive = false
      this.state.combo = 0
      this.addFlash({
        position: {
          x: this.state.player.position.x + this.state.player.width * 0.5,
          y: this.state.player.position.y + this.state.player.height * 0.5,
        },
        radius: this.state.player.width * 3,
        life: FLASH_LONG_LIFETIME,
        strength: 1,
      })
      this.finalizeRun()
    }
  }

  reset(seed?: string, generatorOptions?: BeatLevelGeneratorOptions): void {
    if (seed) {
      this.baseSeed = seed
    }
    const stage = this.state.stage
    const pointer = this.state.pointer
    this.prng = createPrng(this.baseSeed)
    if (generatorOptions) {
      this.generatorOptions = { ...this.generatorOptions, ...generatorOptions }
    }
    this.generator = new BeatLevelGenerator(this.prng, this.generatorOptions)
    this.generator.reset()
    this.flashId = 0
    this.state = createBaseState(this.baseSeed, stage)
    if (pointer) {
      this.state.pointer = { ...pointer }
    }
  }

  private addFlash(flash: Omit<FlashEffect, 'id' | 'age'>): void {
    this.state.flashes.push({
      id: (this.flashId += 1),
      age: 0,
      ...flash,
    })
  }

  private advanceFlashes(dt: number): void {
    this.state.flashes = this.state.flashes
      .map((flash) => ({ ...flash, age: flash.age + dt }))
      .filter((flash) => flash.age < flash.life)
  }

  private updateSessionBest(score: number): void {
    if (Number.isFinite(score) && score > this.sessionBestScore) {
      this.sessionBestScore = score
    }
  }

  private finalizeRun(): void {
    const finalScore = Math.max(0, Math.floor(this.state.score))
    this.updateSessionBest(finalScore)
    if (finalScore > this.personalBest.score) {
      this.personalBest = updatePersonalBest(finalScore)
    }
  }
}
