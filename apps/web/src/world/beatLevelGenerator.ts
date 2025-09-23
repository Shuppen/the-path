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
  private baseBeatInterval: number
  private restProbability: number
  private baseRestProbability: number
  private nextBeatTime: number
  private readonly initialOffset: number
  private beatIndex = 0
  private obstacleId = 0
  private restAdjustment = 0
  private breakHoldTimer = 0
  private intensityHoldTimer = 0
  private lastWorldTime = 0
  private lastExternalBeatTime: number | null = null

  constructor(
    private readonly prng: Prng,
    options: BeatLevelGeneratorOptions = {},
  ) {
    const bpm = options.bpm ?? BASE_BPM
    this.baseBeatInterval = 60 / bpm
    this.beatInterval = this.baseBeatInterval
    this.baseRestProbability = clamp(options.restProbability ?? BEAT_REST_PROBABILITY, 0, 1)
    this.restProbability = this.baseRestProbability
    this.initialOffset = options.initialOffset ?? INITIAL_BEAT_OFFSET
    this.nextBeatTime = this.initialOffset
  }

  reset(time = 0): void {
    this.beatIndex = 0
    this.obstacleId = 0
    this.nextBeatTime = this.initialOffset + time
    this.beatInterval = this.baseBeatInterval
    this.restProbability = this.baseRestProbability
    this.restAdjustment = 0
    this.breakHoldTimer = 0
    this.intensityHoldTimer = 0
    this.lastWorldTime = time
    this.lastExternalBeatTime = null
  }

  update(world: WorldState): void {
    if (world.status !== 'running') return

    const currentTime = world.time
    const dt = Math.max(0, currentTime - this.lastWorldTime)
    this.lastWorldTime = currentTime

    this.relaxBeatInterval(dt)
    this.updateIntensity(dt)

    while (world.time >= this.nextBeatTime) {
      this.spawnObstacle(world)
      this.nextBeatTime += this.beatInterval
      this.beatIndex += 1
    }

    world.beat = this.beatIndex
  }

  syncToExternalBeat(time: number, confidence = 1): void {
    if (!Number.isFinite(time)) return
    const normalizedConfidence = clamp(confidence, 0.15, 3)

    if (this.lastExternalBeatTime !== null) {
      const interval = time - this.lastExternalBeatTime
      if (interval > 0.2 && interval < 2.5) {
        const targetInterval = clamp(interval, 0.25, 1.5)
        const smoothing = clamp(0.18 * normalizedConfidence, 0.08, 0.4)
        this.beatInterval = this.beatInterval * (1 - smoothing) + targetInterval * smoothing
        this.baseBeatInterval = this.baseBeatInterval * 0.94 + targetInterval * 0.06
      }
    }

    this.lastExternalBeatTime = time

    if (this.nextBeatTime < time) {
      this.nextBeatTime = time
    }

    const approxIndex = Math.floor(time / Math.max(this.beatInterval, 0.001))
    if (Number.isFinite(approxIndex) && approxIndex > this.beatIndex) {
      this.beatIndex = approxIndex
    }
  }

  applyEnergySpike(intensity: number): void {
    const normalized = clamp(intensity, 0, 4)
    const boost = clamp(normalized * 0.2, 0.05, 0.45)
    this.restAdjustment = clamp(this.restAdjustment - boost, -0.55, 0.5)
    this.intensityHoldTimer = Math.max(this.intensityHoldTimer, 1.2)
  }

  applyBreak(duration: number): void {
    const scaledDuration = clamp(duration * 0.8, 0.4, 3)
    this.breakHoldTimer = Math.max(this.breakHoldTimer, scaledDuration)
    this.restAdjustment = clamp(this.restAdjustment + 0.18, -0.55, 0.6)
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
      id: (this.obstacleId += 1),
      kind,
      position: { x: spawnX, y: spawnY },
      width,
      height,
      speedFactor,
      passed: false,
      beatIndex: this.beatIndex,
    })
  }

  private relaxBeatInterval(dt: number): void {
    const intervalDelta = this.baseBeatInterval - this.beatInterval
    if (Math.abs(intervalDelta) < 0.0001) return
    const step = clamp(dt * 2.5, 0, 1)
    this.beatInterval += intervalDelta * step
  }

  private updateIntensity(dt: number): void {
    if (this.breakHoldTimer > 0) {
      this.breakHoldTimer = Math.max(0, this.breakHoldTimer - dt)
    }

    if (this.intensityHoldTimer > 0) {
      this.intensityHoldTimer = Math.max(0, this.intensityHoldTimer - dt)
    } else if (Math.abs(this.restAdjustment) > 0) {
      const decay = dt * 0.35
      if (this.restAdjustment > 0) {
        this.restAdjustment = Math.max(0, this.restAdjustment - decay)
      } else {
        this.restAdjustment = Math.min(0, this.restAdjustment + decay)
      }
    }

    const breakModifier = this.breakHoldTimer > 0 ? 0.25 : 0
    this.restProbability = clamp(
      this.baseRestProbability + this.restAdjustment + breakModifier,
      0,
      0.95,
    )
  }
}
