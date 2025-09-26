import { deepMerge } from '../utils/deepMerge'

export type RewardedAdPlacement = 'second_chance' | 'unlock_track_session' | 'currency_boost'

export interface RemoteConfigAdsPlacementConfig {
  frequencyPerHour: number
  cooldownMinutes: number
}

export interface RemoteConfigAdsConfig {
  placements: Record<RewardedAdPlacement, RemoteConfigAdsPlacementConfig>
  rewardAmounts: {
    currencyBoost: number
  }
}

export interface RemoteConfigStoreConfig {
  prices: {
    skin: number
    effect: number
    theme: number
    trackPack: number
  }
  starterPack: {
    price: number
    discountPercent: number
    grantsCoins: number
  }
}

export interface RemoteConfigMissionsConfig {
  dailyGoal: number
  weeklyGoal: number
  dailyRewardCoins: number
  weeklyRewardCoins: number
}

export interface RemoteConfig {
  version: number
  ads: RemoteConfigAdsConfig
  store: RemoteConfigStoreConfig
  missions: RemoteConfigMissionsConfig
}

const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  version: 1,
  ads: {
    placements: {
      second_chance: { frequencyPerHour: 2, cooldownMinutes: 20 },
      unlock_track_session: { frequencyPerHour: 4, cooldownMinutes: 10 },
      currency_boost: { frequencyPerHour: 6, cooldownMinutes: 5 },
    },
    rewardAmounts: {
      currencyBoost: 120,
    },
  },
  store: {
    prices: {
      skin: 750,
      effect: 600,
      theme: 500,
      trackPack: 1200,
    },
    starterPack: {
      price: 4.99,
      discountPercent: 40,
      grantsCoins: 1200,
    },
  },
  missions: {
    dailyGoal: 3,
    weeklyGoal: 12,
    dailyRewardCoins: 150,
    weeklyRewardCoins: 450,
  },
}

let activeConfig: RemoteConfig = DEFAULT_REMOTE_CONFIG

const REMOTE_CONFIG_PATH = '/remote_config.json'

const resolveRemoteConfigUrl = (): string | null => {
  if (REMOTE_CONFIG_PATH.startsWith('http://') || REMOTE_CONFIG_PATH.startsWith('https://')) {
    return REMOTE_CONFIG_PATH
  }

  const globalLocation = (globalThis as { location?: Location }).location

  if (typeof window !== 'undefined' && window.location) {
    try {
      return new URL(REMOTE_CONFIG_PATH, window.location.origin).toString()
    } catch (error) {
      console.warn('Failed to resolve remote config URL from window.location', error)
    }
  }

  if (globalLocation && typeof globalLocation.origin === 'string') {
    try {
      return new URL(REMOTE_CONFIG_PATH, globalLocation.origin).toString()
    } catch (error) {
      console.warn('Failed to resolve remote config URL from global location', error)
    }
  }

  return null
}

const mergeConfig = (base: RemoteConfig, patch: Partial<RemoteConfig> | null | undefined): RemoteConfig => {
  if (!patch) return base
  return deepMerge(base, patch)
}

export const getRemoteConfig = (): RemoteConfig => activeConfig

export const applyRemoteConfig = (patch: Partial<RemoteConfig>): RemoteConfig => {
  activeConfig = mergeConfig(DEFAULT_REMOTE_CONFIG, patch)
  return activeConfig
}

export const loadRemoteConfig = async (): Promise<RemoteConfig> => {
  if (typeof process !== 'undefined' && process.env?.VITEST) {
    activeConfig = DEFAULT_REMOTE_CONFIG
    return activeConfig
  }

  if (typeof fetch !== 'function') {
    activeConfig = DEFAULT_REMOTE_CONFIG
    return activeConfig
  }

  const targetUrl = resolveRemoteConfigUrl()
  if (!targetUrl) {
    activeConfig = DEFAULT_REMOTE_CONFIG
    return activeConfig
  }

  try {
    const response = await fetch(targetUrl, { cache: 'no-store' })
    if (!response.ok) {
      console.warn('Failed to load remote config:', response.status, response.statusText)
      activeConfig = DEFAULT_REMOTE_CONFIG
      return activeConfig
    }
    const payload = (await response.json()) as Partial<RemoteConfig>
    activeConfig = mergeConfig(DEFAULT_REMOTE_CONFIG, payload)
  } catch (error) {
    console.warn('Using default remote config due to error:', error)
    activeConfig = DEFAULT_REMOTE_CONFIG
  }
  return activeConfig
}
