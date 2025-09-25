import { createPrng, type Prng } from '../core/prng'
import type { InputFrame } from '../engine/input'
import {
  BASE_SCROLL_SPEED,
  CALIBRATION_LIMIT_MS,
  COMBO_MULTIPLIER_CAP,
  COMBO_MULTIPLIER_STEP,
  ENDLESS_DENSITY_STEP,
  ENDLESS_SPEED_STEP,
  FEEDBACK_LIFETIME,
  FEVER_DURATION,
  FEVER_DRAIN_RATE,
  FEVER_INCREMENT_GOOD,
  FEVER_INCREMENT_PERFECT,
  FEVER_TRIGGER_THRESHOLD,
  GOOD_SCORE,
  GOOD_WINDOW,
  HITBAR_HEIGHT_RATIO,
  INITIAL_BEAT_OFFSET,
  LANE_COUNT,
  LANE_SWITCH_MAX_DURATION,
  LANE_SWITCH_MIN_DURATION,
  NOTE_PRELOAD_TIME,
  OBSTACLE_DAMAGE,
  PERFECT_SCORE,
  PERFECT_WINDOW,
  RUNNER_INITIAL_SHIELD,
  RUNNER_MAX_HEALTH,
} from './constants'
import { BeatLevelGenerator } from './beatLevelGenerator'
import {
  type ActiveUpgrade,
  type CalibrationSettings,
  type Judgement,
  type LaneIndex,
  type LaneNote,
  type LaneObstacle,
  type MetaProgressState,
  type NoteFeedback,
  type RunnerState,
  type StageMetrics,
  type UpgradeCard,
  type WorldMode,
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

const clamp01 = (value: number): number => {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

const secondsFromMs = (value: number): number => value / 1000

const computeMultiplier = (combo: number): number => {
  if (combo <= 0) return 1
  const step = Math.max(1, COMBO_MULTIPLIER_STEP)
  const tier = Math.floor(combo / step)
  return Math.min(1 + tier, COMBO_MULTIPLIER_CAP)
}

const BASE_CALIBRATION: CalibrationSettings = { inputOffsetMs: 0, audioOffsetMs: 0 }

const DEFAULT_META: MetaProgressState = {
  xp: 0,
  level: 1,
  unlockedTracks: [],
  unlockedSkins: [],
}

const UPGRADE_LIBRARY: UpgradeCard[] = [
  {
    id: 'beat-blade',
    name: 'Ритм-клинок',
    description: 'Каждый 4-й бит отправляет импульс, снимая ближайшее препятствие и давая бонус к очкам.',
    effect: 'damage',
  },
  {
    id: 'perfect-barrier',
    name: 'Идеальный барьер',
    description: '10 perfect подряд добавляют щит, блокирующий урон.',
    effect: 'shield',
  },
  {
    id: 'fever-pulse',
    name: 'Фивер-импульс',
    description: 'Вход во фивер рассеивает препятствия и даёт всплеск очков.',
    effect: 'fever',
  },
]

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

const createRunnerState = (upgrades: ActiveUpgrade[] = []): RunnerState => {
  const shieldStacks = upgrades.filter((upgrade) => upgrade.effect === 'shield').reduce((sum, upgrade) => sum + upgrade.stacks, 0)
  return {
    lane: 1,
    targetLane: 1,
    position: 1,
    transitionFrom: 1,
    transitionStart: 0,
    transitionDuration: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    perfectHits: 0,
    goodHits: 0,
    missHits: 0,
    health: RUNNER_MAX_HEALTH,
    maxHealth: RUNNER_MAX_HEALTH,
    shield: RUNNER_INITIAL_SHIELD + shieldStacks,
    perfectStreak: 0,
    beatCounter: 0,
    comboMultiplier: 1,
    feverMeter: 0,
    feverActive: false,
    feverTimer: 0,
    feverActivations: 0,
    damageBonus: 0,
  }
}

const createBaseState = (
  seed: string,
  stage: StageMetrics,
  mode: WorldMode,
  calibration: CalibrationSettings,
  activeUpgrades: ActiveUpgrade[],
  meta: MetaProgressState,
): WorldState => ({
  seed,
  time: 0,
  beat: 0,
  status: 'menu',
  stage,
  lanes: { count: LANE_COUNT },
  notes: [],
  obstacles: [],
  runner: createRunnerState(activeUpgrades),
  feedback: [],
  accuracy: 1,
  comboMultiplier: 1,
  feverMeter: 0,
  mode,
  calibration,
  speedMultiplier: 0,
  activeUpgrades,
  pendingUpgrades: [],
  meta,
})

const cloneUpgrade = (upgrade: UpgradeCard): UpgradeCard => ({ ...upgrade })

const xpForScore = (score: number, accuracy: number): number => {
  const base = Math.floor(score / 5000)
  return Math.max(1, base + Math.round(accuracy * 10))
}

const gainMetaXp = (meta: MetaProgressState, xp: number): MetaProgressState => {
  const totalXp = meta.xp + Math.max(0, xp)
  let level = meta.level
  let remainingXp = totalXp
  while (remainingXp >= level * 50) {
    remainingXp -= level * 50
    level += 1
  }
  const unlockedTracks = new Set(meta.unlockedTracks)
  const unlockedSkins = new Set(meta.unlockedSkins)
  if (level >= 2) unlockedTracks.add('endless-primer')
  if (level >= 4) unlockedTracks.add('void-drift')
  if (level >= 3) unlockedSkins.add('neon-blade')
  if (level >= 5) unlockedSkins.add('aurora-shield')
  return {
    ...meta,
    xp: totalXp,
    level,
    unlockedTracks: Array.from(unlockedTracks),
    unlockedSkins: Array.from(unlockedSkins),
  }
}

export interface WorldConfig {
  seed: string
  width: number
  height: number
  mode?: WorldMode
  calibration?: Partial<CalibrationSettings>
  upgrades?: ActiveUpgrade[]
  meta?: MetaProgressState
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
    const mode = config.mode ?? 'track'
    const calibration: CalibrationSettings = { ...BASE_CALIBRATION, ...config.calibration }
    const sanitizedCalibration: CalibrationSettings = {
      inputOffsetMs: Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, calibration.inputOffsetMs)),
      audioOffsetMs: Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, calibration.audioOffsetMs)),
    }
    const activeUpgrades = (config.upgrades ?? []).map((upgrade) => ({ ...upgrade }))
    const meta = config.meta ? { ...config.meta } : { ...DEFAULT_META }
    this.generator = new BeatLevelGenerator(this.prng, {
      initialOffset: INITIAL_BEAT_OFFSET,
    })
    this.state = createBaseState(this.baseSeed, stage, mode, sanitizedCalibration, activeUpgrades, meta)
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

  setCalibration(calibration: Partial<CalibrationSettings>): void {
    const merged = { ...this.state.calibration, ...calibration }
    this.state.calibration = {
      inputOffsetMs: Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, merged.inputOffsetMs)),
      audioOffsetMs: Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, merged.audioOffsetMs)),
    }
  }

  setActiveUpgrades(upgrades: ActiveUpgrade[]): void {
    this.state.activeUpgrades = upgrades.map((upgrade) => ({ ...upgrade }))
    this.state.runner = createRunnerState(this.state.activeUpgrades)
    this.state.pendingUpgrades = []
  }

  reset(seed: string = this.baseSeed, mode: WorldMode = this.state.mode): void {
    this.generator.reset()
    const stage = this.state.stage
    this.state = createBaseState(
      seed,
      stage,
      mode,
      this.state.calibration,
      this.state.activeUpgrades,
      this.state.meta,
    )
    this.state.seed = seed
  }

  snapshot(): WorldSnapshot {
    const hits = this.state.runner.perfectHits + this.state.runner.goodHits
    const misses = this.state.runner.missHits
    const accuracy = hits + misses === 0 ? 1 : hits / (hits + misses)
    const xpEarned = xpForScore(Math.floor(this.state.runner.score), accuracy)
    return {
      score: Math.floor(this.state.runner.score),
      combo: this.state.runner.combo,
      bestCombo: this.state.runner.bestCombo,
      status: this.state.status,
      seed: this.state.seed,
      accuracy,
      hits,
      misses,
      health: this.state.runner.health,
      feverActivations: this.state.runner.feverActivations,
      xpEarned,
      mode: this.state.mode,
      upgrades: {
        active: this.state.activeUpgrades.map((upgrade) => ({ ...upgrade })),
        offered: this.state.pendingUpgrades.map(cloneUpgrade),
      },
      meta: { ...this.state.meta },
    }
  }

  chooseUpgrade(id: string): ActiveUpgrade | null {
    const choice = this.state.pendingUpgrades.find((upgrade) => upgrade.id === id)
    if (!choice) return null

    const existing = this.state.activeUpgrades.find((upgrade) => upgrade.id === choice.id)
    if (existing) {
      existing.stacks += 1
      return existing
    }
    const active: ActiveUpgrade = { ...choice, stacks: 1 }
    this.state.activeUpgrades.push(active)
    return active
  }

  private getCurrentTime(fallbackDt: number): number {
    const offset = secondsFromMs(this.state.calibration.audioOffsetMs)
    const externalTime = this.externalClock?.()
    if (typeof externalTime === 'number' && Number.isFinite(externalTime) && externalTime >= 0) {
      return externalTime + offset
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
    const entry: NoteFeedback = {
      id: (this.feedbackId += 1),
      judgement,
      createdAt: this.state.time,
      x: laneCenter,
      y: stage.hitLineY,
    }
    this.state.feedback.push(entry)
  }

  private updateAccuracy(): void {
    const hits = this.state.runner.perfectHits + this.state.runner.goodHits
    const total = hits + this.state.runner.missHits
    this.state.accuracy = total === 0 ? 1 : Math.max(0, Math.min(1, hits / total))
  }

  private applyDamage(amount: number): void {
    const runner = this.state.runner
    if (amount <= 0) return
    if (runner.shield > 0) {
      runner.shield = Math.max(0, runner.shield - amount)
      return
    }
    runner.health = Math.max(0, runner.health - amount)
    if (runner.health <= 0) {
      this.state.status = 'gameover'
    }
  }

  private handleMiss(noteLane: LaneIndex): void {
    const runner = this.state.runner
    runner.combo = 0
    runner.comboMultiplier = 1
    runner.perfectStreak = 0
    runner.missHits += 1
    runner.feverActive = false
    runner.feverTimer = 0
    runner.feverMeter = 0
    this.state.comboMultiplier = runner.comboMultiplier
    this.state.feverMeter = runner.feverMeter
    this.applyDamage(OBSTACLE_DAMAGE)
    this.addFeedback('miss', noteLane)
    this.updateAccuracy()
  }

  private triggerDamageImpulse(): void {
    if (this.state.obstacles.length === 0) {
      this.state.runner.damageBonus += PERFECT_SCORE * 0.25
      return
    }
    const now = this.state.time
    const affected: LaneObstacle[] = []
    for (const obstacle of this.state.obstacles) {
      if (obstacle.resolved) continue
      if (Math.abs(obstacle.time - now) <= GOOD_WINDOW * 2) {
        obstacle.resolved = true
        affected.push(obstacle)
      }
    }
    if (affected.length > 0) {
      this.state.runner.damageBonus += PERFECT_SCORE * 0.5 * affected.length
    }
  }

  private applyUpgradesOnHit(judgement: Judgement): void {
    const runner = this.state.runner
    const damageStacks = this.state.activeUpgrades
      .filter((upgrade) => upgrade.effect === 'damage')
      .reduce((sum, upgrade) => sum + upgrade.stacks, 0)
    const shieldStacks = this.state.activeUpgrades
      .filter((upgrade) => upgrade.effect === 'shield')
      .reduce((sum, upgrade) => sum + upgrade.stacks, 0)

    runner.beatCounter += 1
    if (damageStacks > 0 && runner.beatCounter % Math.max(4 - damageStacks, 1) === 0) {
      this.triggerDamageImpulse()
    }

    if (judgement === 'perfect') {
      runner.perfectStreak += 1
      if (shieldStacks > 0 && runner.perfectStreak % Math.max(10 - shieldStacks * 2, 3) === 0) {
        runner.shield += 1
      }
    } else {
      runner.perfectStreak = 0
    }
  }

  private gainFever(judgement: Judgement): void {
    const runner = this.state.runner
    const increment = judgement === 'perfect' ? FEVER_INCREMENT_PERFECT : FEVER_INCREMENT_GOOD
    runner.feverMeter = clamp01(runner.feverMeter + increment)
    if (!runner.feverActive && runner.feverMeter >= FEVER_TRIGGER_THRESHOLD) {
      this.activateFever()
    }
    this.state.feverMeter = runner.feverMeter
  }

  private activateFever(): void {
    const runner = this.state.runner
    runner.feverActive = true
    runner.feverTimer = FEVER_DURATION
    runner.feverMeter = 1
    runner.feverActivations += 1
    this.state.feverMeter = runner.feverMeter

    const feverStacks = this.state.activeUpgrades
      .filter((upgrade) => upgrade.effect === 'fever')
      .reduce((sum, upgrade) => sum + upgrade.stacks, 0)
    if (feverStacks > 0) {
      const now = this.state.time
      const window = Math.max(0.4, 0.8 - feverStacks * 0.1)
      for (const obstacle of this.state.obstacles) {
        if (obstacle.resolved) continue
        if (Math.abs(obstacle.time - now) <= window) {
          obstacle.resolved = true
          runner.damageBonus += PERFECT_SCORE * 0.35
        }
      }
    }
  }

  private applyJudgement(note: LaneNote, judgement: Judgement, hitTime: number): void {
    note.judged = true
    note.judgement = judgement
    note.hitTime = hitTime

    const runner = this.state.runner
    if (judgement === 'miss') {
      this.handleMiss(note.lane)
      return
    }

    if (judgement === 'perfect') {
      runner.perfectHits += 1
      runner.score += PERFECT_SCORE
    } else {
      runner.goodHits += 1
      runner.score += GOOD_SCORE
    }

    this.applyUpgradesOnHit(judgement)
    this.gainFever(judgement)

    runner.combo += 1
    runner.bestCombo = Math.max(runner.bestCombo, runner.combo)
    runner.comboMultiplier = computeMultiplier(runner.combo)
    if (runner.feverActive) {
      runner.comboMultiplier += 1
    }
    this.state.comboMultiplier = runner.comboMultiplier
    runner.score += runner.damageBonus
    runner.damageBonus = 0
    this.addFeedback(judgement, note.lane)
    this.updateAccuracy()
  }

  private judgeLane(lane: LaneIndex, currentTime: number): Judgement | null {
    const adjustedTime = currentTime + secondsFromMs(this.state.calibration.inputOffsetMs)
    const upcoming = this.state.notes.find((candidate) => !candidate.judged && candidate.lane === lane)
    if (!upcoming) {
      return null
    }

    const delta = adjustedTime - upcoming.time
    if (delta < -GOOD_WINDOW) {
      return null
    }

    if (Math.abs(delta) <= PERFECT_WINDOW) {
      this.applyJudgement(upcoming, 'perfect', adjustedTime)
      return 'perfect'
    }

    if (Math.abs(delta) <= GOOD_WINDOW) {
      this.applyJudgement(upcoming, 'good', adjustedTime)
      return 'good'
    }

    this.applyJudgement(upcoming, 'miss', adjustedTime)
    return 'miss'
  }

  private evaluateRunnerPosition(time: number): number {
    const runner = this.state.runner
    if (runner.transitionDuration <= 0) {
      return runner.targetLane
    }

    const elapsed = time - runner.transitionStart
    if (elapsed <= 0) {
      return runner.position
    }

    const normalized = clamp01(elapsed / Math.max(runner.transitionDuration, 0.0001))
    return runner.transitionFrom + (runner.targetLane - runner.transitionFrom) * normalized
  }

  private beginLaneTransition(target: LaneIndex): void {
    const runner = this.state.runner
    const currentPosition = this.evaluateRunnerPosition(this.state.time)
    runner.position = currentPosition
    runner.lane = clampLane(Math.round(currentPosition))

    if (target === runner.targetLane) {
      runner.transitionFrom = runner.targetLane
      runner.transitionDuration = 0
      runner.position = runner.targetLane
      runner.lane = runner.targetLane
      return
    }

    const duration = this.prng.nextRange(LANE_SWITCH_MIN_DURATION, LANE_SWITCH_MAX_DURATION)
    runner.transitionFrom = runner.lane
    runner.targetLane = target
    runner.transitionStart = this.state.time
    runner.transitionDuration = duration
  }

  private switchLane(direction: number): void {
    if (!direction) return

    const runner = this.state.runner
    const currentPosition = this.evaluateRunnerPosition(this.state.time)
    runner.position = currentPosition
    runner.lane = clampLane(Math.round(currentPosition))

    let target = runner.targetLane
    if (direction < 0) {
      target = clampLane(target - 1)
    } else if (direction > 0) {
      target = clampLane(target + 1)
    }

    this.beginLaneTransition(target)
  }

  private updateLaneTransition(): void {
    const runner = this.state.runner
    const position = this.evaluateRunnerPosition(this.state.time)
    runner.position = position
    runner.lane = clampLane(Math.round(position))

    if (runner.transitionDuration <= 0) {
      runner.transitionFrom = runner.targetLane
      runner.transitionStart = this.state.time
      runner.position = runner.targetLane
      runner.lane = runner.targetLane
      return
    }

    const elapsed = this.state.time - runner.transitionStart
    if (elapsed >= runner.transitionDuration) {
      runner.transitionDuration = 0
      runner.transitionFrom = runner.targetLane
      runner.position = runner.targetLane
      runner.lane = runner.targetLane
    }
  }

  private resolveExpiredNotes(currentTime: number): void {
    for (const note of this.state.notes) {
      if (!note.judged && currentTime - note.time > GOOD_WINDOW) {
        this.applyJudgement(note, 'miss', note.time)
      }
    }

    const pruneBefore = currentTime - NOTE_PRELOAD_TIME * 1.2
    this.state.notes = this.state.notes.filter((note) => note.time >= pruneBefore)
  }

  private resolveObstacleMisses(currentTime: number): void {
    for (const obstacle of this.state.obstacles) {
      if (obstacle.resolved) continue
      if (currentTime - obstacle.time > GOOD_WINDOW) {
        obstacle.resolved = true
      }
    }

    const pruneBefore = currentTime - NOTE_PRELOAD_TIME * 1.5
    this.state.obstacles = this.state.obstacles.filter((obstacle) => obstacle.time >= pruneBefore || !obstacle.resolved)
  }

  private processObstacleCollisions(currentTime: number): void {
    const runnerLane = this.state.runner.lane
    for (const obstacle of this.state.obstacles) {
      if (obstacle.resolved) continue
      if (obstacle.lane !== runnerLane) continue
      if (Math.abs(currentTime - obstacle.time) <= GOOD_WINDOW) {
        obstacle.resolved = true
        this.handleMiss(obstacle.lane)
      }
    }
  }

  private updateFever(dt: number): void {
    const runner = this.state.runner
    if (!runner.feverActive) {
      runner.feverMeter = clamp01(runner.feverMeter)
      this.state.feverMeter = runner.feverMeter
      return
    }

    runner.feverTimer -= dt
    if (runner.feverTimer <= 0) {
      runner.feverActive = false
      runner.feverTimer = 0
      runner.feverMeter = 0.4
      this.state.feverMeter = runner.feverMeter
      this.state.comboMultiplier = computeMultiplier(runner.combo)
      return
    }

    runner.feverMeter = clamp01(runner.feverMeter - FEVER_DRAIN_RATE * dt)
    this.state.feverMeter = runner.feverMeter
  }

  private updateEndless(dt: number): void {
    if (this.state.mode !== 'endless') {
      this.state.speedMultiplier = 0
      return
    }
    this.state.speedMultiplier += dt * (ENDLESS_SPEED_STEP + ENDLESS_DENSITY_STEP * 0.5)
    this.state.speedMultiplier = Math.min(this.state.speedMultiplier, 24)
  }

  private prepareUpgradeChoices(): void {
    const pool = UPGRADE_LIBRARY.filter((upgrade) => {
      const active = this.state.activeUpgrades.find((entry) => entry.id === upgrade.id)
      return !active || active.stacks < 3
    })

    const choices: UpgradeCard[] = []
    const available = pool.length === 0 ? [...UPGRADE_LIBRARY] : pool
    while (choices.length < 3 && available.length > 0) {
      const index = Math.floor(this.prng.next() * available.length)
      const [card] = available.splice(index, 1)
      choices.push(cloneUpgrade(card))
    }
    this.state.pendingUpgrades = choices
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

    const frame: InputFrame = input.frame ?? { tapLane: null, swipe: 0 }
    this.switchLane(frame.swipe)

    this.generator.update(this.state, NOTE_PRELOAD_TIME)
    this.resolveExpiredNotes(this.state.time)

    if (frame.tapLane !== null) {
      this.judgeLane(clampLane(frame.tapLane), this.state.time)
    }

    this.processObstacleCollisions(this.state.time)
    this.resolveObstacleMisses(this.state.time)

    this.updateLaneTransition()
    this.updateFeedback(dt)
    this.updateFever(dt)
    this.updateEndless(dt)

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
    const snapshot = this.snapshot()
    const nextMeta = gainMetaXp(this.state.meta, snapshot.xpEarned)
    this.state.meta = nextMeta
    this.prepareUpgradeChoices()
    this.state.status = 'gameover'
    this.pendingReset = true
  }

  getSessionBest(): number {
    return this.sessionBestScore
  }
}
