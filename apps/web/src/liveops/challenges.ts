import type { RemoteConfig } from '../services/remoteConfig'

import type { RemoteConfig } from '../services/remoteConfig'

export type ChallengeKind = 'daily' | 'weekly'

export interface LeaderboardEntry {
  name: string
  score: number
}

export interface ChallengeState {
  id: string
  kind: ChallengeKind
  title: string
  description: string
  goal: number
  progress: number
  rewardCoins: number
  leaderboard: LeaderboardEntry[]
  expiresAt: number
  claimed: boolean
}

const STORAGE_KEY = 'the-path/challenges'

interface StoredChallengeState {
  id: string
  progress: number
  claimed: boolean
  leaderboard: LeaderboardEntry[]
  expiresAt: number
}

const getStorage = (): Storage | null => {
  try {
    if ('localStorage' in globalThis) {
      return (globalThis as { localStorage?: Storage }).localStorage ?? null
    }
  } catch (error) {
    console.warn('Challenge storage unavailable', error)
  }
  return null
}

const readStoredState = (): Partial<Record<ChallengeKind, StoredChallengeState>> => {
  const storage = getStorage()
  if (!storage) return {}
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<Record<ChallengeKind, StoredChallengeState>>
  } catch (error) {
    console.warn('Failed to parse challenge state', error)
    return {}
  }
}

const writeStoredState = (state: Partial<Record<ChallengeKind, StoredChallengeState>>): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('Failed to persist challenge state', error)
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

const createChallengeId = (kind: ChallengeKind, timestamp: number): string => {
  const date = new Date(timestamp)
  if (kind === 'weekly') {
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - date.getUTCDay()))
    const weekStart = Date.UTC(
      firstDay.getUTCFullYear(),
      firstDay.getUTCMonth(),
      firstDay.getUTCDate(),
      0,
      0,
      0,
      0,
    )
    return `${kind}-${weekStart}`
  }
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  return `${kind}-${dayStart}`
}

const createExpiration = (kind: ChallengeKind, timestamp: number): number => {
  if (kind === 'weekly') {
    return timestamp + 7 * DAY_MS
  }
  return timestamp + DAY_MS
}

const generateLeaderboard = (seed: string): LeaderboardEntry[] => {
  const names = ['Lumen', 'Pulse', 'Helix', 'Orion', 'Nova', 'Rift']
  const scores = [120000, 98000, 75000, 62000, 53000, 47000]
  const entries: LeaderboardEntry[] = []
  for (let i = 0; i < names.length; i += 1) {
    const jitter = Math.floor((seed.charCodeAt(i % seed.length) % 7) * 350)
    entries.push({ name: names[i], score: scores[i] + jitter })
  }
  return entries
}

const baseTitle = {
  daily: 'Ежедневный челлендж',
  weekly: 'Еженедельный спринт',
} as const satisfies Record<ChallengeKind, string>

const baseDescription = {
  daily: 'Переиграйте треки и соберите цепочки perfect.',
  weekly: 'Набирайте очки, удерживая серию в течение недели.',
} as const satisfies Record<ChallengeKind, string>

export const getChallengeState = (
  kind: ChallengeKind,
  config: RemoteConfig,
  timestamp = Date.now(),
): ChallengeState => {
  const stored = readStoredState()
  const id = createChallengeId(kind, timestamp)
  const expiresAt = createExpiration(kind, timestamp)
  const rewardCoins = kind === 'daily' ? config.missions.dailyRewardCoins : config.missions.weeklyRewardCoins
  const goal = kind === 'daily' ? config.missions.dailyGoal : config.missions.weeklyGoal

  const cached = stored[kind]
  if (!cached || cached.id !== id || cached.expiresAt < timestamp) {
    const leaderboard = generateLeaderboard(id)
    const nextState: StoredChallengeState = {
      id,
      progress: 0,
      claimed: false,
      leaderboard,
      expiresAt,
    }
    stored[kind] = nextState
    writeStoredState(stored)
    return {
      id,
      kind,
      title: baseTitle[kind],
      description: baseDescription[kind],
      goal,
      progress: 0,
      rewardCoins,
      leaderboard,
      expiresAt,
      claimed: false,
    }
  }

  return {
    id,
    kind,
    title: baseTitle[kind],
    description: baseDescription[kind],
    goal,
    progress: Math.min(goal, cached.progress),
    rewardCoins,
    leaderboard: cached.leaderboard.length ? cached.leaderboard : generateLeaderboard(id),
    expiresAt: cached.expiresAt,
    claimed: cached.claimed,
  }
}

export const recordChallengeProgress = (
  kind: ChallengeKind,
  delta: number,
  config: RemoteConfig,
  timestamp = Date.now(),
): ChallengeState => {
  const stored = readStoredState()
  const current = getChallengeState(kind, config, timestamp)
  const updatedProgress = Math.min(current.goal, current.progress + Math.max(0, delta))
  const updated: StoredChallengeState = {
    id: current.id,
    progress: updatedProgress,
    claimed: current.claimed,
    leaderboard: current.leaderboard,
    expiresAt: current.expiresAt,
  }
  stored[kind] = updated
  writeStoredState(stored)
  return {
    ...current,
    progress: updatedProgress,
  }
}

export const markChallengeClaimed = (
  kind: ChallengeKind,
  config: RemoteConfig,
  timestamp = Date.now(),
): ChallengeState => {
  const stored = readStoredState()
  const current = getChallengeState(kind, config, timestamp)
  const updated: StoredChallengeState = {
    id: current.id,
    progress: current.progress,
    claimed: true,
    leaderboard: current.leaderboard,
    expiresAt: current.expiresAt,
  }
  stored[kind] = updated
  writeStoredState(stored)
  return {
    ...current,
    claimed: true,
  }
}
