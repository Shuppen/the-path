import type { RewardedAdPlacement } from './remoteConfig'
import type { WorldMode } from '../world'

interface AnalyticsEventBase {
  timestamp: number
  name: keyof AnalyticsEventMap
}

export interface AnalyticsEventMap {
  session_start: { sessionId: string }
  session_end: { sessionId: string; durationMs: number }
  level_start: { sessionId: string; trackId: string; mode: WorldMode }
  level_end: {
    sessionId: string
    trackId: string
    mode: WorldMode
    result: 'success' | 'fail'
    score: number
    accuracy: number
  }
  iap_purchase: {
    sessionId: string
    sku: string
    price: number
    currency: string
    kind: 'soft' | 'real'
    meta?: Record<string, string | number | boolean>
  }
  ad_reward: {
    sessionId: string
    placement: RewardedAdPlacement
    rewardType: 'life' | 'track' | 'currency'
    value: number
  }
  share_export: {
    sessionId: string
    presetId: string
    duration: number
    format: string
  }
  retention_d1: { sessionId: string }
  retention_d7: { sessionId: string }
}

export interface AnalyticsRecord extends AnalyticsEventBase {
  payload: AnalyticsEventMap[keyof AnalyticsEventMap]
}

const STORAGE_KEY = 'the-path/analytics'
const SESSION_KEY = `${STORAGE_KEY}/session`
const RETENTION_KEY = `${STORAGE_KEY}/retention`

const getStorage = (): Storage | null => {
  try {
    if ('localStorage' in globalThis) {
      return (globalThis as { localStorage?: Storage }).localStorage ?? null
    }
  } catch (error) {
    console.warn('Analytics storage unavailable', error)
  }
  return null
}

const now = (): number => Date.now()

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `session-${Math.random().toString(36).slice(2, 10)}`
}

const HOURS_24 = 24 * 60 * 60 * 1000
const HOURS_168 = 7 * 24 * 60 * 60 * 1000

interface StoredRetentionState {
  firstSeen: number
  lastSeen: number
  reportedD1: boolean
  reportedD7: boolean
}

const readRetentionState = (): StoredRetentionState => {
  const storage = getStorage()
  if (!storage) {
    return { firstSeen: now(), lastSeen: 0, reportedD1: false, reportedD7: false }
  }
  try {
    const raw = storage.getItem(RETENTION_KEY)
    if (!raw) {
      const initial = { firstSeen: now(), lastSeen: 0, reportedD1: false, reportedD7: false }
      storage.setItem(RETENTION_KEY, JSON.stringify(initial))
      return initial
    }
    const parsed = JSON.parse(raw) as Partial<StoredRetentionState>
    return {
      firstSeen: Number.isFinite(parsed.firstSeen) ? Number(parsed.firstSeen) : now(),
      lastSeen: Number.isFinite(parsed.lastSeen) ? Number(parsed.lastSeen) : 0,
      reportedD1: Boolean(parsed.reportedD1),
      reportedD7: Boolean(parsed.reportedD7),
    }
  } catch (error) {
    console.warn('Failed to read retention state', error)
    return { firstSeen: now(), lastSeen: 0, reportedD1: false, reportedD7: false }
  }
}

const writeRetentionState = (state: StoredRetentionState): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(RETENTION_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('Failed to persist retention state', error)
  }
}

export class AnalyticsService {
  private readonly buffer: AnalyticsRecord[] = []
  private sessionId: string | null = null
  private sessionStartedAt = 0

  getSessionId(): string | null {
    return this.sessionId
  }

  getBufferedEvents(): AnalyticsRecord[] {
    return [...this.buffer]
  }

  startSession(): string {
    const active = this.sessionId ?? createId()
    this.sessionId = active
    this.sessionStartedAt = now()
    this.push('session_start', { sessionId: active })
    this.evaluateRetention()
    return active
  }

  endSession(): void {
    if (!this.sessionId) return
    const duration = Math.max(0, now() - this.sessionStartedAt)
    this.push('session_end', { sessionId: this.sessionId, durationMs: duration })
    this.persistSession()
    this.sessionId = null
    this.sessionStartedAt = 0
  }

  trackLevelStart(trackId: string, mode: WorldMode): void {
    if (!this.sessionId) this.startSession()
    this.push('level_start', { sessionId: this.sessionId!, trackId, mode })
  }

  trackLevelEnd(trackId: string, mode: WorldMode, result: 'success' | 'fail', score: number, accuracy: number): void {
    if (!this.sessionId) this.startSession()
    this.push('level_end', { sessionId: this.sessionId!, trackId, mode, result, score, accuracy })
  }

  trackPurchase(params: Omit<AnalyticsEventMap['iap_purchase'], 'sessionId'>): void {
    if (!this.sessionId) this.startSession()
    this.push('iap_purchase', { ...params, sessionId: this.sessionId! })
  }

  trackAdReward(params: Omit<AnalyticsEventMap['ad_reward'], 'sessionId'>): void {
    if (!this.sessionId) this.startSession()
    this.push('ad_reward', { ...params, sessionId: this.sessionId! })
  }

  trackShareExport(params: Omit<AnalyticsEventMap['share_export'], 'sessionId'>): void {
    if (!this.sessionId) this.startSession()
    this.push('share_export', { ...params, sessionId: this.sessionId! })
  }

  private push<K extends keyof AnalyticsEventMap>(name: K, payload: AnalyticsEventMap[K]): void {
    const record: AnalyticsRecord = {
      name,
      payload,
      timestamp: now(),
    }
    if (typeof console !== 'undefined') {
      console.debug('[analytics]', name, payload)
    }
    this.buffer.push(record)
  }

  private persistSession(): void {
    const storage = getStorage()
    if (!storage || !this.sessionId) return
    try {
      storage.setItem(
        SESSION_KEY,
        JSON.stringify({ sessionId: this.sessionId, endedAt: now() }),
      )
    } catch (error) {
      console.warn('Failed to persist session analytics', error)
    }
  }

  private evaluateRetention(): void {
    const storage = getStorage()
    const state = readRetentionState()
    const current = now()
    const updated: StoredRetentionState = {
      firstSeen: state.firstSeen || current,
      lastSeen: current,
      reportedD1: state.reportedD1,
      reportedD7: state.reportedD7,
    }

    if (!state.firstSeen) {
      updated.firstSeen = current
    }

    const sinceFirst = current - updated.firstSeen

    if (!updated.reportedD1 && sinceFirst >= HOURS_24) {
      if (!this.sessionId) this.startSession()
      this.push('retention_d1', { sessionId: this.sessionId! })
      updated.reportedD1 = true
    }

    if (!updated.reportedD7 && sinceFirst >= HOURS_168) {
      if (!this.sessionId) this.startSession()
      this.push('retention_d7', { sessionId: this.sessionId! })
      updated.reportedD7 = true
    }

    writeRetentionState(updated)
    if (storage) {
      try {
        storage.setItem(RETENTION_KEY, JSON.stringify(updated))
      } catch (error) {
        console.warn('Failed to persist retention checkpoints', error)
      }
    }
  }
}

export const createAnalytics = (): AnalyticsService => new AnalyticsService()
