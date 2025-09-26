import type { MetaProgressState } from '../world'
import type { RemoteConfig } from '../services/remoteConfig'

export type CosmeticCategory = 'skin' | 'theme' | 'effect'

export interface CosmeticItem {
  id: string
  title: string
  description: string
  category: CosmeticCategory
  unlockId: string
}

export interface TrackBundle {
  id: string
  title: string
  description: string
  trackIds: string[]
}

export interface StarterPackContent {
  coins: number
  skins: string[]
  themes: string[]
  effects: string[]
  tracks: string[]
}

export interface StarterPackOffer {
  id: string
  title: string
  description: string
  basePrice: number
  discountPercent: number
  finalPrice: number
  content: StarterPackContent
}

export const COSMETIC_ITEMS: CosmeticItem[] = [
  {
    id: 'skin-neon-waves',
    title: 'Неоновые волны',
    description: 'Переливающийся облик пилота с градиентными дорожками.',
    category: 'skin',
    unlockId: 'skin-neon-waves',
  },
  {
    id: 'skin-starlit-ronin',
    title: 'Звёздный ронин',
    description: 'Холоперо и плащ, мерцающие при идеальных попаданиях.',
    category: 'skin',
    unlockId: 'skin-starlit-ronin',
  },
  {
    id: 'effect-ion-tail',
    title: 'Ионный шлейф',
    description: 'Синие частицы расходятся при свайпах по дорожкам.',
    category: 'effect',
    unlockId: 'effect-ion-tail',
  },
  {
    id: 'effect-prism-burst',
    title: 'Призматический всплеск',
    description: 'Удары озаряются геометрическими вспышками.',
    category: 'effect',
    unlockId: 'effect-prism-burst',
  },
  {
    id: 'theme-midnight-rain',
    title: 'Полночный дождь',
    description: 'Темы меню с влажным асфальтом и неоном.',
    category: 'theme',
    unlockId: 'theme-midnight-rain',
  },
  {
    id: 'theme-arcade-sunset',
    title: 'Аркадный закат',
    description: 'Тёплый градиент, вдохновлённый ретро-витринами.',
    category: 'theme',
    unlockId: 'theme-arcade-sunset',
  },
]

export const TRACK_BUNDLES: TrackBundle[] = [
  {
    id: 'bundle-synthwave-intro',
    title: 'Синтвейв старт',
    description: 'Три атмосферных трека для мягкого онбординга.',
    trackIds: ['bright-beats', 'smooth-rush', 'percussive-drive'],
  },
  {
    id: 'bundle-reactor-drive',
    title: 'Реактор драйв',
    description: 'Сложные ритмы для охотников за рекордами.',
    trackIds: ['percussive-drive'],
  },
]

export const STARTER_PACK_ID = 'starter-pack'

export const createStarterPackOffer = (config: RemoteConfig): StarterPackOffer => {
  const content: StarterPackContent = {
    coins: config.store.starterPack.grantsCoins,
    skins: ['skin-neon-waves'],
    themes: ['theme-midnight-rain'],
    effects: ['effect-ion-tail'],
    tracks: ['bright-beats', 'smooth-rush'],
  }

  const finalPrice = +(config.store.starterPack.price * (1 - config.store.starterPack.discountPercent / 100)).toFixed(2)

  return {
    id: STARTER_PACK_ID,
    title: 'Новичковый набор',
    description: 'Скидка на стартовую коллекцию косметики и монет.',
    basePrice: config.store.starterPack.price,
    discountPercent: config.store.starterPack.discountPercent,
    finalPrice,
    content,
  }
}

export interface PurchaseResult {
  success: boolean
  updatedMeta: MetaProgressState
  coinsSpent: number
  unlocked?: string[]
  error?: string
}

const hasUnlock = (meta: MetaProgressState, unlockId: string): boolean => {
  if (meta.unlockedSkins.includes(unlockId)) return true
  if (meta.ownedThemes.includes(unlockId)) return true
  if (meta.ownedEffects.includes(unlockId)) return true
  if (meta.unlockedTracks.includes(unlockId)) return true
  return false
}

const spendCoins = (meta: MetaProgressState, price: number): MetaProgressState => ({
  ...meta,
  coins: Math.max(0, meta.coins - price),
})

const dedupe = (input: string[]): string[] => Array.from(new Set(input))

export const resolveCosmeticPrice = (item: CosmeticItem, config: RemoteConfig): number => {
  switch (item.category) {
    case 'skin':
      return config.store.prices.skin
    case 'effect':
      return config.store.prices.effect
    case 'theme':
    default:
      return config.store.prices.theme
  }
}

export const resolveBundlePrice = (bundle: TrackBundle, config: RemoteConfig): number => config.store.prices.trackPack

export const applyCosmeticPurchase = (
  meta: MetaProgressState,
  item: CosmeticItem,
  price: number,
): PurchaseResult => {
  if (meta.coins < price) {
    return { success: false, coinsSpent: 0, updatedMeta: meta, error: 'Недостаточно валюты' }
  }

  if (hasUnlock(meta, item.unlockId)) {
    return { success: false, coinsSpent: 0, updatedMeta: meta, error: 'Уже куплено' }
  }

  const updated = spendCoins(meta, price)
  if (item.category === 'skin') {
    updated.unlockedSkins = dedupe([...updated.unlockedSkins, item.unlockId])
  }
  if (item.category === 'theme') {
    updated.ownedThemes = dedupe([...updated.ownedThemes, item.unlockId])
  }
  if (item.category === 'effect') {
    updated.ownedEffects = dedupe([...updated.ownedEffects, item.unlockId])
  }

  return {
    success: true,
    updatedMeta: { ...updated },
    coinsSpent: price,
    unlocked: [item.unlockId],
  }
}

export const applyTrackBundlePurchase = (
  meta: MetaProgressState,
  bundle: TrackBundle,
  price: number,
): PurchaseResult => {
  if (meta.coins < price) {
    return { success: false, coinsSpent: 0, updatedMeta: meta, error: 'Недостаточно валюты' }
  }

  const updated = spendCoins(meta, price)
  const unlocks = dedupe([...updated.unlockedTracks, ...bundle.trackIds])
  return {
    success: true,
    coinsSpent: price,
    unlocked: bundle.trackIds,
    updatedMeta: { ...updated, unlockedTracks: unlocks },
  }
}

export const applyStarterPackPurchase = (
  meta: MetaProgressState,
  offer: StarterPackOffer,
): PurchaseResult => {
  if (meta.starterPackPurchased) {
    return { success: false, coinsSpent: 0, updatedMeta: meta, error: 'Набор уже активирован' }
  }

  const updated: MetaProgressState = {
    ...meta,
    coins: meta.coins + offer.content.coins,
    unlockedSkins: dedupe([...meta.unlockedSkins, ...offer.content.skins]),
    ownedThemes: dedupe([...meta.ownedThemes, ...offer.content.themes]),
    ownedEffects: dedupe([...meta.ownedEffects, ...offer.content.effects]),
    unlockedTracks: dedupe([...meta.unlockedTracks, ...offer.content.tracks]),
    starterPackPurchased: true,
  }

  return {
    success: true,
    coinsSpent: 0,
    unlocked: [
      ...offer.content.skins,
      ...offer.content.themes,
      ...offer.content.effects,
      ...offer.content.tracks,
    ],
    updatedMeta: updated,
  }
}
