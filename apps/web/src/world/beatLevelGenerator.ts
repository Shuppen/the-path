import { ENDLESS_DENSITY_STEP, ENDLESS_SPEED_STEP, NOTE_PRELOAD_TIME } from './constants'
import type { Prng } from '../core/prng'
import type { LaneIndex, LaneNote, LaneObstacle, WorldState } from './types'

export interface BeatLevelGeneratorOptions {
  bpm?: number
  initialOffset?: number
}

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const LANE_POOL: LaneIndex[] = [0, 1, 2, 3]

export class BeatLevelGenerator {
  private baseBeatInterval: number
  private beatInterval: number
  private readonly initialOffset: number
  private nextBeatTime: number
  private beatIndex = 0
  private noteId = 0
  private obstacleId = 0
  private laneHistory: LaneIndex[] = []
  private obstacleCooldown = 0
  private tempoAdjustment = 0
  private lastExternalBeat: number | null = null
  private useExternalClock = false

  constructor(
    private readonly prng: Prng,
    options: BeatLevelGeneratorOptions = {},
  ) {
    const bpm = options.bpm ?? 120
    this.baseBeatInterval = 60 / Math.max(1, bpm)
    this.beatInterval = this.baseBeatInterval
    this.initialOffset = options.initialOffset ?? 0
    this.nextBeatTime = this.initialOffset
  }

  reset(): void {
    this.beatIndex = 0
    this.noteId = 0
    this.obstacleId = 0
    this.nextBeatTime = this.initialOffset
    this.laneHistory.length = 0
    this.tempoAdjustment = 0
    this.lastExternalBeat = null
    this.obstacleCooldown = 0
    this.useExternalClock = false
  }

  update(world: WorldState, leadTime: number = NOTE_PRELOAD_TIME): void {
    if (world.status !== 'running') return

    this.relaxTempo(world.time)
    this.updateEndlessScaling(world)
    const targetTime = world.time + leadTime

    while (this.nextBeatTime <= targetTime) {
      const note = this.createNote(this.nextBeatTime)
      this.insertNote(world, note)
      this.maybeSpawnObstacle(world, this.nextBeatTime)
      this.nextBeatTime += this.beatInterval
      this.beatIndex += 1
    }

    world.beat = this.beatIndex
  }

  private createNote(time: number): LaneNote {
    const lane: LaneIndex = this.pickLane()
    this.laneHistory.push(lane)
    if (this.laneHistory.length > 2) {
      this.laneHistory.shift()
    }
    return {
      id: (this.noteId += 1),
      lane,
      time,
      kind: 'tap',
      judged: false,
    }
  }

  private pickLane(): LaneIndex {
    const history = this.laneHistory.slice(-2)
    const forbidden = history.length === 2 && history[0] === history[1] ? history[0] : null
    if (forbidden !== null) {
      const options = LANE_POOL.filter((lane) => lane !== forbidden)
      return this.prng.pick(options as LaneIndex[])
    }

    if (history.length === 1 && this.prng.next() < 0.35) {
      const options = LANE_POOL.filter((lane) => lane !== history[0])
      return this.prng.pick(options as LaneIndex[])
    }

    return this.prng.pick(LANE_POOL)
  }

  private maybeSpawnObstacle(world: WorldState, time: number): void {
    if (this.obstacleCooldown > 0) {
      this.obstacleCooldown -= 1
      return
    }

    const difficulty =
      world.mode === 'endless' ? Math.min(1.2, 0.3 + world.speedMultiplier * ENDLESS_DENSITY_STEP) : 0.3
    if (this.prng.next() > difficulty) {
      return
    }

    const lane = this.pickLane()
    const obstacle: LaneObstacle = {
      id: (this.obstacleId += 1),
      lane,
      time: time + this.beatInterval * 0.5,
      kind: this.prng.next() > 0.5 ? 'enemy' : 'obstacle',
      damage: 1,
      resolved: false,
    }
    world.obstacles.push(obstacle)
    this.obstacleCooldown = this.prng.nextInt(2, 5)
  }

  private relaxTempo(currentTime: number): void {
    if (this.tempoAdjustment !== 0) {
      const decay = 1 - clamp((currentTime - this.nextBeatTime + this.beatInterval) * 0.08, 0.02, 0.08)
      this.tempoAdjustment *= decay
      if (Math.abs(this.tempoAdjustment) < 0.0005) {
        this.tempoAdjustment = 0
      }
    }

    const clampedAdjustment = clamp(this.tempoAdjustment, -0.35, 0.45)
    this.beatInterval = clamp(this.baseBeatInterval * (1 + clampedAdjustment), 0.2, 1.6)
  }

  private updateEndlessScaling(world: WorldState): void {
    if (world.mode !== 'endless') {
      return
    }

    const ramp = 1 + world.speedMultiplier * ENDLESS_SPEED_STEP
    this.beatInterval = clamp(this.baseBeatInterval / ramp, 0.15, 1.2)
  }

  syncToExternalBeat(time: number, confidence = 1, world?: WorldState, quantizedTime?: number): void {
    if (!Number.isFinite(time)) return
    const normalizedConfidence = clamp(confidence, 0.1, 3)

    if (this.lastExternalBeat !== null) {
      const interval = time - this.lastExternalBeat
      if (interval > 0.2 && interval < 2.5) {
        const smoothing = clamp(0.12 * normalizedConfidence, 0.04, 0.35)
        this.baseBeatInterval = this.baseBeatInterval * (1 - smoothing) + interval * smoothing
        this.beatInterval = this.baseBeatInterval
      }
    }

    this.lastExternalBeat = time
    if (this.nextBeatTime < time) {
      this.nextBeatTime = time
    }

    const approxIndex = Math.floor(time / Math.max(this.beatInterval, 0.001))
    if (Number.isFinite(approxIndex) && approxIndex > this.beatIndex) {
      this.beatIndex = approxIndex
    }

    if (world) {
      this.useExternalClock = true
      const target = Number.isFinite(quantizedTime) ? (quantizedTime as number) : time
      this.spawnExternalBeat(world, target)
    }
  }

  applyEnergySpike(intensity: number): void {
    const normalized = clamp(intensity, 0, 4)
    this.tempoAdjustment = clamp(this.tempoAdjustment - normalized * 0.08, -0.35, 0.4)
  }

  applyBreak(duration: number): void {
    const normalized = clamp(duration, 0, 4)
    this.tempoAdjustment = clamp(this.tempoAdjustment + normalized * 0.1, -0.35, 0.45)
  }

  getBeatIndex(): number {
    return this.beatIndex
  }

  private insertNote(world: WorldState, note: LaneNote): void {
    const existing = world.notes.find(
      (candidate) =>
        !candidate.judged &&
        candidate.lane === note.lane &&
        Math.abs(candidate.time - note.time) <= Math.max(this.beatInterval * 0.3, 0.12),
    )
    if (existing) {
      return
    }

    const index = world.notes.findIndex((candidate) => candidate.time > note.time)
    if (index === -1) {
      world.notes.push(note)
    } else {
      world.notes.splice(index, 0, note)
    }
  }

  private spawnExternalBeat(world: WorldState, targetTime: number): void {
    const clamped = Math.max(targetTime, world.time)
    const note = this.createNote(clamped)
    note.time = clamped
    this.insertNote(world, note)
    this.nextBeatTime = clamped + this.beatInterval
  }
}
