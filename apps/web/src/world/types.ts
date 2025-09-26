export type WorldStatus = 'menu' | 'running' | 'paused' | 'gameover'

export type LaneIndex = 0 | 1 | 2 | 3

export type Judgement = 'perfect' | 'good' | 'miss'

export type WorldMode = 'track' | 'endless'

export interface StageMetrics {
  width: number
  height: number
  hitLineY: number
  laneWidth: number
  lanePadding: number
  laneCount: number
  scrollSpeed: number
}

export interface LaneNote {
  id: number
  lane: LaneIndex
  time: number
  kind: 'tap' | 'hold'
  duration?: number
  judgement?: Judgement
  judged: boolean
  hitTime?: number
}

export interface LaneObstacle {
  id: number
  lane: LaneIndex
  time: number
  kind: 'obstacle' | 'enemy'
  damage: number
  resolved: boolean
}

export interface NoteFeedback {
  id: number
  judgement: Judgement
  createdAt: number
  x: number
  y: number
}

export interface CalibrationSettings {
  inputOffsetMs: number
  audioOffsetMs: number
}

export interface UpgradeCard {
  id: string
  name: string
  description: string
  effect: 'damage' | 'shield' | 'fever'
}

export interface ActiveUpgrade extends UpgradeCard {
  stacks: number
}

export interface RunnerState {
  lane: LaneIndex
  targetLane: LaneIndex

  position: number
  transitionFrom: number

  transitionStart: number
  transitionDuration: number
  combo: number
  bestCombo: number
  score: number
  perfectHits: number
  goodHits: number
  missHits: number
  health: number
  maxHealth: number
  shield: number
  perfectStreak: number
  beatCounter: number
  comboMultiplier: number
  feverMeter: number
  feverActive: boolean
  feverTimer: number
  feverActivations: number
  damageBonus: number
}

export interface MetaProgressState {
  xp: number
  level: number
  unlockedTracks: string[]
  unlockedSkins: string[]
}

export interface WorldState {
  seed: string
  time: number
  beat: number
  status: WorldStatus
  stage: StageMetrics
  lanes: { count: number }
  notes: LaneNote[]
  obstacles: LaneObstacle[]
  runner: RunnerState
  feedback: NoteFeedback[]
  accuracy: number
  comboMultiplier: number
  feverMeter: number
  mode: WorldMode
  calibration: CalibrationSettings
  speedMultiplier: number
  activeUpgrades: ActiveUpgrade[]
  pendingUpgrades: UpgradeCard[]
  meta: MetaProgressState
}

export interface WorldSnapshot {
  score: number
  combo: number
  bestCombo: number
  status: WorldStatus
  seed: string
  accuracy: number
  hits: number
  misses: number
  health: number
  feverActivations: number
  xpEarned: number
  mode: WorldMode
  upgrades: {
    active: ActiveUpgrade[]
    offered: UpgradeCard[]
  }
  meta: MetaProgressState
}

export type WorldAudioEvent =
  | { type: 'hit'; judgement: Judgement; lane: LaneIndex; time: number; combo: number }
  | { type: 'miss'; lane: LaneIndex; time: number }
  | { type: 'fever'; state: 'start' | 'end'; time: number }
  | { type: 'lane-shift'; direction: 'left' | 'right'; lane: LaneIndex; time: number }
