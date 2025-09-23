import { BASE_BPM, BEAT_REST_PROBABILITY, INITIAL_BEAT_OFFSET, SCROLL_SPEED } from './constants'
import type { Prng } from '../core/prng'
import type { WorldState } from './types'

export interface BeatLevelGeneratorOptions {
  bpm?: number
  restProbability?: number
  initialOffset?: number
}

const OBSTACLE_VARIANTS = ['pulse', 'spire', 'block'] as const

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

export class BeatLevelGenerator {
  private beatInterval: number
  private restProbability: number
  private nextBeatTime: number
  private readonly initialOffset: number
  private beatIndex = 0
  private obstacleId = 0

  constructor(
    private readonly prng: Prng,
    options: BeatLevelGeneratorOptions = {}
  ) {
    const bpm = options.bpm ?? BASE_BPM
    this.beatInterval = 60 / bpm
    this.restProbability = clamp(options.restProbability ?? BEAT_REST_PROBABILITY, 0, 1)
    this.initialOffset = options.initialOffset ?? INITIAL_BEAT_OFFSET
    this.nextBeatTime = this.initialOffset
  }

  reset(): void {
    this.beatIndex = 0
    this.obstacleId = 0
    this.nextBeatTime = this.initialOffset
  }

  update(world: WorldState): void {
    if (world.status !== 'running') return

    while (world.time >= this.nextBeatTime) {
      this.spawnObstacle(world)
      this.nextBeatTime += this.beatInterval
      this.beatIndex += 1
    }

    world.beat = this.beatIndex
  }

  private spawnObstacle(world: WorldState): void {
    if (this.prng.next() < this.restProbability) {
      return
    }

    const kind = this.prng.pick(OBSTACLE_VARIANTS)
    const stage = world.stage
    const groundHeight = stage.groundHeight

    const widthBase = groundHeight * this.prng.nextRange(0.25, 0.55)
    let width = widthBase
    let height = groundHeight * this.prng.nextRange(0.4, 0.85)
    let speedFactor = clamp(1 + this.prng.nextRange(-0.08, 0.12), 0.85, 1.2)

    if (kind === 'spire') {
      width *= 0.75
      height = groundHeight * this.prng.nextRange(0.6, 1)
      speedFactor = clamp(1 + this.prng.nextRange(-0.05, 0.08), 0.9, 1.15)
    } else if (kind === 'block') {
      width *= 1.1
      height = groundHeight * this.prng.nextRange(0.35, 0.55)
      speedFactor = clamp(1 + this.prng.nextRange(-0.12, 0.15), 0.82, 1.18)
    }

    const spawnX = stage.width + SCROLL_SPEED * 0.6
    const spawnY = stage.groundY - height

    world.obstacles.push({
      id: this.obstacleId += 1,
      kind,
      position: { x: spawnX, y: spawnY },
      width,
      height,
      speedFactor,
      passed: false,
      beatIndex: this.beatIndex,
    })
  }
}
