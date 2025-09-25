export type WorldStatus = 'menu' | 'running' | 'paused' | 'gameover'

export type LaneIndex = 0 | 1 | 2 | 3

export type Judgement = 'perfect' | 'good' | 'miss'

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
  judgement?: Judgement
  judged: boolean
  hitTime?: number
}

export interface NoteFeedback {
  id: number
  judgement: Judgement
  createdAt: number
  x: number
  y: number
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
}

export interface WorldState {
  seed: string
  time: number
  beat: number
  status: WorldStatus
  stage: StageMetrics
  lanes: { count: number }
  notes: LaneNote[]
  runner: RunnerState
  feedback: NoteFeedback[]
  accuracy: number
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
}
