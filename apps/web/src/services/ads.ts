import { getRemoteConfig, type RemoteConfig, type RewardedAdPlacement } from './remoteConfig'

type RewardType = 'life' | 'track' | 'currency'

export interface RewardedAdReward {
  type: RewardType
  amount: number
}

export interface RewardedAdResult {
  status: 'rewarded' | 'capped' | 'unavailable' | 'error'
  reward?: RewardedAdReward
  message?: string
}

interface PlacementState {
  windowStart: number
  impressions: number
  lastShown: number
}

const STORAGE_KEY = 'the-path/ads/rewarded'

const getStorage = (): Storage | null => {
  try {
    if ('localStorage' in globalThis) {
      return (globalThis as { localStorage?: Storage }).localStorage ?? null
    }
  } catch (error) {
    console.warn('Ads storage unavailable', error)
  }
  return null
}

const readState = (): Record<RewardedAdPlacement, PlacementState> => {
  const storage = getStorage()
  if (!storage) {
    return {
      second_chance: { windowStart: 0, impressions: 0, lastShown: 0 },
      unlock_track_session: { windowStart: 0, impressions: 0, lastShown: 0 },
      currency_boost: { windowStart: 0, impressions: 0, lastShown: 0 },
    }
  }

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        second_chance: { windowStart: 0, impressions: 0, lastShown: 0 },
        unlock_track_session: { windowStart: 0, impressions: 0, lastShown: 0 },
        currency_boost: { windowStart: 0, impressions: 0, lastShown: 0 },
      }
    }
    const parsed = JSON.parse(raw) as Partial<Record<RewardedAdPlacement, PlacementState>>
    return {
      second_chance: parsed.second_chance ?? { windowStart: 0, impressions: 0, lastShown: 0 },
      unlock_track_session: parsed.unlock_track_session ?? { windowStart: 0, impressions: 0, lastShown: 0 },
      currency_boost: parsed.currency_boost ?? { windowStart: 0, impressions: 0, lastShown: 0 },
    }
  } catch (error) {
    console.warn('Failed to parse rewarded ads state', error)
    return {
      second_chance: { windowStart: 0, impressions: 0, lastShown: 0 },
      unlock_track_session: { windowStart: 0, impressions: 0, lastShown: 0 },
      currency_boost: { windowStart: 0, impressions: 0, lastShown: 0 },
    }
  }
}

const writeState = (state: Record<RewardedAdPlacement, PlacementState>): void => {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('Failed to persist rewarded ads state', error)
  }
}

const now = (): number => Date.now()

const HOUR_MS = 60 * 60 * 1000

const createDefaultState = (): Record<RewardedAdPlacement, PlacementState> => ({
  second_chance: { windowStart: 0, impressions: 0, lastShown: 0 },
  unlock_track_session: { windowStart: 0, impressions: 0, lastShown: 0 },
  currency_boost: { windowStart: 0, impressions: 0, lastShown: 0 },
})

const resolveReward = (placement: RewardedAdPlacement, config: RemoteConfig): RewardedAdReward => {
  switch (placement) {
    case 'second_chance':
      return { type: 'life', amount: 1 }
    case 'unlock_track_session':
      return { type: 'track', amount: 1 }
    case 'currency_boost':
    default:
      return { type: 'currency', amount: Math.max(50, config.ads.rewardAmounts.currencyBoost) }
  }
}

const waitFor = (duration: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, duration)
  })

export class RewardedAdService {
  private state: Record<RewardedAdPlacement, PlacementState>

  constructor(private readonly resolveConfig: () => RemoteConfig = getRemoteConfig) {
    this.state = readState()
  }

  getRemainingQuota(placement: RewardedAdPlacement): number {
    const config = this.resolveConfig()
    const placementConfig = config.ads.placements[placement]
    if (!placementConfig) return 0
    const entry = this.ensureWindow(placement)
    return Math.max(0, placementConfig.frequencyPerHour - entry.impressions)
  }

  getCooldownMinutes(placement: RewardedAdPlacement): number {
    const config = this.resolveConfig()
    const placementConfig = config.ads.placements[placement]
    return placementConfig?.cooldownMinutes ?? 0
  }

  async show(placement: RewardedAdPlacement): Promise<RewardedAdResult> {
    const config = this.resolveConfig()
    const placementConfig = config.ads.placements[placement]
    if (!placementConfig) {
      return { status: 'unavailable', message: 'Placement disabled' }
    }

    const entry = this.ensureWindow(placement)
    const current = now()
    if (entry.impressions >= placementConfig.frequencyPerHour) {
      return { status: 'capped', message: 'Frequency cap reached' }
    }

    if (placementConfig.cooldownMinutes > 0) {
      const cooldownMs = placementConfig.cooldownMinutes * 60 * 1000
      if (current - entry.lastShown < cooldownMs) {
        return { status: 'capped', message: 'Cooldown active' }
      }
    }

    try {
      await waitFor(800)
    } catch (error) {
      console.warn('Rewarded ad simulation failed', error)
      return { status: 'error', message: 'Playback interrupted' }
    }

    entry.impressions += 1
    entry.lastShown = current
    writeState(this.state)

    return {
      status: 'rewarded',
      reward: resolveReward(placement, config),
    }
  }

  reset(): void {
    this.state = createDefaultState()
    writeState(this.state)
  }

  private ensureWindow(placement: RewardedAdPlacement): PlacementState {
    const current = now()
    const entry = this.state[placement] ?? { windowStart: 0, impressions: 0, lastShown: 0 }
    if (current - entry.windowStart >= HOUR_MS) {
      entry.windowStart = current
      entry.impressions = 0
    }
    this.state[placement] = entry
    return entry
  }
}

export const createRewardedAdService = (
  resolver?: () => RemoteConfig,
): RewardedAdService => new RewardedAdService(resolver)
