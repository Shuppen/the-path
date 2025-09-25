import { BASE_BPM, NOTE_PRELOAD_TIME } from './constants'
import type { Prng } from '../core/prng'
import type { LaneIndex, LaneNote, WorldState } from './types'

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
  private lastLane: LaneIndex | null = null
  private tempoAdjustment = 0
  private lastExternalBeat: number | null = null

  constructor(
    private readonly prng: Prng,
    options: BeatLevelGeneratorOptions = {},
  ) {
    const bpm = options.bpm ?? BASE_BPM
    this.baseBeatInterval = 60 / Math.max(1, bpm)
    this.beatInterval = this.baseBeatInterval
    this.initialOffset = options.initialOffset ?? 0
    this.nextBeatTime = this.initialOffset
  }

  reset(): void {
    this.beatIndex = 0
    this.noteId = 0
    this.nextBeatTime = this.initialOffset
    this.lastLane = null
    this.tempoAdjustment = 0
    this.lastExternalBeat = null
  }

  update(world: WorldState, leadTime: number = NOTE_PRELOAD_TIME): void {
    if (world.status !== 'running') return

    this.relaxTempo(world.time)
    const targetTime = world.time + leadTime

    while (this.nextBeatTime <= targetTime) {
      const note = this.createNote(this.nextBeatTime)
      world.notes.push(note)
      this.nextBeatTime += this.beatInterval
      this.beatIndex += 1
    }

    world.beat = this.beatIndex
  }

  private createNote(time: number): LaneNote {
    let lane: LaneIndex = this.pickLane()
    this.lastLane = lane
    return {
      id: (this.noteId += 1),
      lane,
      time,
      judged: false,
    }
  }

  private pickLane(): LaneIndex {
    if (this.lastLane === null) {
      return this.prng.pick(LANE_POOL)
    }

    if (this.prng.next() < 0.6) {
      const options = LANE_POOL.filter((lane) => lane !== this.lastLane)
      return this.prng.pick(options as LaneIndex[])
    }

    return this.prng.pick(LANE_POOL)
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

  syncToExternalBeat(time: number, confidence = 1): void {
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
}
