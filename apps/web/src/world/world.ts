import { createPrng, type Prng } from '../core/prng'
import type { InputFrame, SwipeDirection } from '../engine/input'
import {
  BASE_SCROLL_SPEED,
  FEEDBACK_LIFETIME,
  GOOD_SCORE,
  GOOD_WINDOW,
  HITBAR_HEIGHT_RATIO,
  INITIAL_BEAT_OFFSET,
  LANE_COUNT,
  LANE_SWITCH_MAX_DURATION,
  LANE_SWITCH_MIN_DURATION,
  NOTE_PRELOAD_TIME,
  PERFECT_SCORE,
  PERFECT_WINDOW,
} from './constants'
import { BeatLevelGenerator } from './beatLevelGenerator'
import {
  type Judgement,
  type LaneIndex,
  type LaneNote,
  type RunnerState,
  type StageMetrics,
  type WorldSnapshot,
  type WorldState,
  type WorldStatus,
} from './types'
import { readPersonalBest, updatePersonalBest, type PersonalBestRecord } from './personalBest'

const clampLane = (lane: number): LaneIndex => {
  if (lane < 0) return 0
  if (lane >= LANE_COUNT) return (LANE_COUNT - 1) as LaneIndex
  return lane as LaneIndex
}

const createStageMetrics = (width: number, height: number): StageMetrics => {
  const lanePadding = Math.max(12, Math.min(width * 0.04, 32))
  const availableWidth = Math.max(0, width - lanePadding * 2)
  const laneWidth = availableWidth / LANE_COUNT
  const hitLineY = height * (1 - HITBAR_HEIGHT_RATIO * 0.5)
  return {
    width,
    height,
    hitLineY,
    laneWidth,
    lanePadding,
    laneCount: LANE_COUNT,
    scrollSpeed: BASE_SCROLL_SPEED,
  }
}

const createRunnerState = (): RunnerState => ({
  lane: 1,
  targetLane: 1,
  transitionFrom: 1,
  transitionStart: 0,
  transitionDuration: 0,
  combo: 0,
  bestCombo: 0,
  score: 0,
  perfectHits: 0,
  goodHits: 0,
  missHits: 0,
})

const createBaseState = (seed: string, stage: StageMetrics): WorldState => ({
  seed,
  time: 0,
  beat: 0,
  status: 'menu',
  stage,
  lanes: { count: LANE_COUNT },
  notes: [],
  runner: createRunnerState(),
  feedback: [],
  accuracy: 1,
})

export interface WorldConfig {
  seed: string
  width: number
  height: number
}

export interface WorldUpdateInput {
  frame?: InputFrame
  dt: number
}

export class World {
  public state: WorldState

  private readonly baseSeed: string
  private readonly prng: Prng
  private readonly generator: BeatLevelGenerator
  private externalClock?: () => number | null
  private feedbackId = 0
  private sessionBestScore = 0
  private personalBest: PersonalBestRecord
  private pendingReset = false

  constructor(config: WorldConfig) {
    this.baseSeed = config.seed
    const stage = createStageMetrics(config.width, config.height)
    this.prng = createPrng(this.baseSeed)
    this.generator = new BeatLevelGenerator(this.prng, {
      initialOffset: INITIAL_BEAT_OFFSET,
    })
    this.state = createBaseState(this.baseSeed, stage)
    this.personalBest = readPersonalBest()
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
  }

  reset(seed: string = this.baseSeed): void {
    this.generator.reset()
    this.state = createBaseState(seed, this.state.stage)
    this.state.seed = seed
  }

  snapshot(): WorldSnapshot {
    const hits = this.state.runner.perfectHits + this.state.runner.goodHits
    const misses = this.state.runner.missHits
    return {
      score: Math.floor(this.state.runner.score),
      combo: this.state.runner.combo,
      bestCombo: this.state.runner.bestCombo,
      status: this.state.status,
      seed: this.state.seed,
      accuracy: hits + misses === 0 ? 1 : hits / (hits + misses),
      hits,
      misses,
    }
  }

  private getCurrentTime(fallbackDt: number): number {
    const externalTime = this.externalClock?.()
    if (typeof externalTime === 'number' && Number.isFinite(externalTime) && externalTime >= 0) {
      return externalTime
    }
    return this.state.time + fallbackDt
  }

  private updateFeedback(dt: number): void {
    const now = this.state.time
    this.state.feedback = this.state.feedback.filter((entry) => now - entry.createdAt < FEEDBACK_LIFETIME - dt * 0.25)
  }

  private addFeedback(judgement: Judgement, lane: LaneIndex): void {
    const { stage } = this.state
    const laneCenter = stage.lanePadding + stage.laneWidth * (lane + 0.5)
    this.state.feedback.push({
      id: (this.feedbackId += 1),
      judgement,
      createdAt: this.state.time,
      x: laneCenter,
      y: stage.hitLineY,
    })
  }

  private updateAccuracy(): void {
    const hits = this.state.runner.perfectHits + this.state.runner.goodHits
    const total = hits + this.state.runner.missHits
    this.state.accuracy = total === 0 ? 1 : Math.max(0, Math.min(1, hits / total))
  }

  private markJudgement(note: LaneNote, judgement: Judgement, hitTime: number): void {
    note.judged = true
    note.judgement = judgement
    note.hitTime = hitTime

    const runner = this.state.runner
    if (judgement === 'miss') {
      runner.combo = 0
      runner.missHits += 1
      this.addFeedback(judgement, note.lane)
      this.updateAccuracy()
      return
    }

    const isPerfect = judgement === 'perfect'
    if (isPerfect) {
      runner.perfectHits += 1
      runner.score += PERFECT_SCORE
    } else {
      runner.goodHits += 1
      runner.score += GOOD_SCORE
    }

    runner.combo += 1
    runner.bestCombo = Math.max(runner.bestCombo, runner.combo)
    this.addFeedback(judgement, note.lane)
    this.updateAccuracy()
  }

  private judgeLane(lane: LaneIndex, currentTime: number): Judgement | null {
    const activeLane = this.state.runner.targetLane
    if (lane !== activeLane) {
      return null
    }
    const upcoming = this.state.notes.find((note) => !note.judged && note.lane === lane)
    if (!upcoming) {
      return null
    }

    const delta = currentTime - upcoming.time
    if (delta < -GOOD_WINDOW) {
      // Too early
      return null
    }

    if (Math.abs(delta) <= PERFECT_WINDOW) {
      this.markJudgement(upcoming, 'perfect', currentTime)
      return 'perfect'
    }

    if (Math.abs(delta) <= GOOD_WINDOW) {
      this.markJudgement(upcoming, 'good', currentTime)
      return 'good'
    }

    this.markJudgement(upcoming, 'miss', currentTime)
    return 'miss'
  }

  private switchLane(direction: SwipeDirection | null): void {
    if (!direction) return
    let target = this.state.runner.targetLane
    if (direction === 'left') {
      target -= 1
    } else if (direction === 'right') {
      target += 1
    } else {
      return
    }

    target = clampLane(target)
    const runner = this.state.runner
    if (target === runner.targetLane) {
      return
    }

    const duration = this.prng.nextRange(LANE_SWITCH_MIN_DURATION, LANE_SWITCH_MAX_DURATION)
    runner.transitionFrom = runner.lane
    runner.targetLane = target
    runner.transitionStart = this.state.time
    runner.transitionDuration = duration
  }

  private updateLaneTransition(): void {
    const runner = this.state.runner
    if (runner.lane === runner.targetLane) return
    const elapsed = this.state.time - runner.transitionStart
    if (elapsed >= runner.transitionDuration) {
      runner.lane = runner.targetLane
      runner.transitionDuration = 0
      return
    }
  }

  private updateNotes(currentTime: number): void {
    for (const note of this.state.notes) {
      if (!note.judged && currentTime - note.time > GOOD_WINDOW) {
        this.markJudgement(note, 'miss', note.time)
      }
    }

    const pruneBefore = currentTime - NOTE_PRELOAD_TIME * 1.2
    this.state.notes = this.state.notes.filter((note) => note.time >= pruneBefore)
  }

  update(input: WorldUpdateInput): void {
    const currentStatus: WorldStatus = this.state.status

    if (currentStatus !== 'running') {
      if (currentStatus === 'gameover' && this.pendingReset) {
        this.pendingReset = false
        this.state.status = 'menu'
      }
      return
    }

    const nextTime = this.getCurrentTime(input.dt)
    const dt = Math.max(0, nextTime - this.state.time)
    this.state.time += dt

    const frame: InputFrame = input.frame ?? { tapLane: null, swipe: null }
    this.switchLane(frame.swipe)

    this.generator.update(this.state, NOTE_PRELOAD_TIME)
    this.updateNotes(this.state.time)

    if (frame.tapLane !== null) {
      this.judgeLane(clampLane(frame.tapLane), this.state.time)
    }

    this.updateLaneTransition()
    this.updateFeedback(dt)

    this.state.beat = this.generator.getBeatIndex()

    const score = Math.floor(this.state.runner.score)
    if (score > this.sessionBestScore) {
      this.sessionBestScore = score
    }
    if (score > this.personalBest.score) {
      this.personalBest = updatePersonalBest(score)
    }
  }

  completeRun(): void {
    this.state.status = 'gameover'
    this.pendingReset = true
  }

  getSessionBest(): number {
    return this.sessionBestScore
  }

  getPersonalBest(): number {
    return this.personalBest.score
  }
}
