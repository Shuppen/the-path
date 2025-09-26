import type { MetaProgressState } from '../world'
import type { RemoteConfig } from '../services/remoteConfig'

export type BattlePassLane = 'free' | 'premium'

export interface BattlePassRewardDefinition {
  id: string
  lane: BattlePassLane
  xpRequired: number
  title: string
  description: string
  reward: { type: 'currency'; amount: number } | { type: 'cosmetic'; unlockId: string } | { type: 'track'; trackId: string }
}

const SEASON_DURATION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

const getSeasonAnchor = (timestamp: number): number => {
  const date = new Date(timestamp)
  const utcYear = date.getUTCFullYear()
  const utcMonth = date.getUTCMonth()
  const start = Date.UTC(utcYear, utcMonth, 1, 0, 0, 0, 0)
  return start
}

const getSeasonId = (timestamp: number): string => {
  const anchor = getSeasonAnchor(timestamp)
  const date = new Date(anchor)
  return `season-${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`
}

export const ensureBattlePassSeason = (
  meta: MetaProgressState,
  timestamp = Date.now(),
): MetaProgressState => {
  const seasonId = getSeasonId(timestamp)
  if (meta.battlePass.seasonId === seasonId && meta.battlePass.expiresAt > timestamp) {
    return meta
  }

  const start = getSeasonAnchor(timestamp)
  const expiresAt = start + SEASON_DURATION_DAYS * DAY_MS

  return {
    ...meta,
    battlePass: {
      seasonId,
      xp: 0,
      premiumUnlocked: false,
      freeClaimed: [],
      premiumClaimed: [],
      expiresAt,
    },
  }
}

const baseRewards: BattlePassRewardDefinition[] = [
  {
    id: 'free-tier-1',
    lane: 'free',
    xpRequired: 0,
    title: 'Бонус монет',
    description: '+100 мягкой валюты за вход в сезон',
    reward: { type: 'currency', amount: 100 },
  },
  {
    id: 'free-tier-2',
    lane: 'free',
    xpRequired: 200,
    title: 'Скин «Неоновые волны»',
    description: 'Раскраска для тех, кто прошёл вступление.',
    reward: { type: 'cosmetic', unlockId: 'skin-neon-waves' },
  },
  {
    id: 'free-tier-3',
    lane: 'free',
    xpRequired: 450,
    title: '200 монет',
    description: 'Монеты на новые эффекты.',
    reward: { type: 'currency', amount: 200 },
  },
  {
    id: 'premium-tier-1',
    lane: 'premium',
    xpRequired: 0,
    title: 'Тема «Аркадный закат»',
    description: 'Тёплые цвета интерфейса.',
    reward: { type: 'cosmetic', unlockId: 'theme-arcade-sunset' },
  },
  {
    id: 'premium-tier-2',
    lane: 'premium',
    xpRequired: 300,
    title: 'Эффект «Призматический всплеск»',
    description: 'Фейерверки при идеальных попаданиях.',
    reward: { type: 'cosmetic', unlockId: 'effect-prism-burst' },
  },
  {
    id: 'premium-tier-3',
    lane: 'premium',
    xpRequired: 600,
    title: 'Редкий трек «Void Drift»',
    description: 'Только для владельцев пропуска.',
    reward: { type: 'track', trackId: 'void-drift' },
  },
]

export const getBattlePassRewards = (): BattlePassRewardDefinition[] => baseRewards

export interface ClaimResult {
  success: boolean
  updatedMeta: MetaProgressState
  claimedId?: string
  reward?: BattlePassRewardDefinition['reward']
  error?: string
}

const dedupe = (input: string[]): string[] => Array.from(new Set(input))

const applyReward = (meta: MetaProgressState, reward: BattlePassRewardDefinition['reward']): MetaProgressState => {
  if (reward.type === 'currency') {
    return { ...meta, coins: meta.coins + reward.amount }
  }
  if (reward.type === 'cosmetic') {
    if (reward.unlockId.startsWith('skin-')) {
      return { ...meta, unlockedSkins: dedupe([...meta.unlockedSkins, reward.unlockId]) }
    }
    if (reward.unlockId.startsWith('theme-')) {
      return { ...meta, ownedThemes: dedupe([...meta.ownedThemes, reward.unlockId]) }
    }
    if (reward.unlockId.startsWith('effect-')) {
      return { ...meta, ownedEffects: dedupe([...meta.ownedEffects, reward.unlockId]) }
    }
    return meta
  }
  if (reward.type === 'track') {
    return { ...meta, unlockedTracks: dedupe([...meta.unlockedTracks, reward.trackId]) }
  }
  return meta
}

export const claimBattlePassReward = (
  meta: MetaProgressState,
  rewardId: string,
): ClaimResult => {
  const rewards = getBattlePassRewards()
  const reward = rewards.find((entry) => entry.id === rewardId)
  if (!reward) {
    return { success: false, updatedMeta: meta, error: 'Награда не найдена' }
  }

  if (meta.battlePass.xp < reward.xpRequired) {
    return { success: false, updatedMeta: meta, error: 'Недостаточно прогресса' }
  }

  const claimedSet = new Set(
    reward.lane === 'free' ? meta.battlePass.freeClaimed : meta.battlePass.premiumClaimed,
  )
  if (claimedSet.has(reward.id)) {
    return { success: false, updatedMeta: meta, error: 'Награда уже получена' }
  }

  if (reward.lane === 'premium' && !meta.battlePass.premiumUnlocked) {
    return { success: false, updatedMeta: meta, error: 'Нужен премиум доступ' }
  }

  const updatedMeta = applyReward(meta, reward.reward)

  const battlePass = {
    ...updatedMeta.battlePass,
    freeClaimed:
      reward.lane === 'free'
        ? dedupe([...updatedMeta.battlePass.freeClaimed, reward.id])
        : updatedMeta.battlePass.freeClaimed,
    premiumClaimed:
      reward.lane === 'premium'
        ? dedupe([...updatedMeta.battlePass.premiumClaimed, reward.id])
        : updatedMeta.battlePass.premiumClaimed,
  }

  return {
    success: true,
    updatedMeta: { ...updatedMeta, battlePass },
    claimedId: reward.id,
    reward: reward.reward,
  }
}

export const unlockPremiumBattlePass = (meta: MetaProgressState): MetaProgressState => ({
  ...meta,
  battlePass: { ...meta.battlePass, premiumUnlocked: true },
})

export const addBattlePassXp = (meta: MetaProgressState, amount: number): MetaProgressState => ({
  ...meta,
  battlePass: { ...meta.battlePass, xp: meta.battlePass.xp + Math.max(0, amount) },
})

export const getBattlePassProgress = (meta: MetaProgressState): {
  xp: number
  laneProgress: Record<BattlePassLane, { claimed: string[] }>
} => ({
  xp: meta.battlePass.xp,
  laneProgress: {
    free: { claimed: [...meta.battlePass.freeClaimed] },
    premium: { claimed: [...meta.battlePass.premiumClaimed] },
  },
})

export const getBattlePassSeasonEnd = (meta: MetaProgressState): number => meta.battlePass.expiresAt

export const syncBattlePassWithConfig = (
  meta: MetaProgressState,
  _config: RemoteConfig,
  timestamp = Date.now(),
): MetaProgressState => ensureBattlePassSeason(meta, timestamp)
