import type { RemoteConfig } from '../services/remoteConfig'
import type { MetaProgressState } from '../world'
import {
  COSMETIC_ITEMS,
  TRACK_BUNDLES,
  applyCosmeticPurchase,
  applyStarterPackPurchase,
  applyTrackBundlePurchase,
  createStarterPackOffer,
  resolveBundlePrice,
  resolveCosmeticPrice,
  type CosmeticItem,
  type TrackBundle,
} from '../liveops/storeCatalog'

interface StoreScreenProps {
  meta: MetaProgressState
  config: RemoteConfig
  onBack: () => void
  onCommitPurchase: (
    meta: MetaProgressState,
    payload: { description: string; sku: string; price?: number; currency?: string; kind: 'soft' | 'real' },
  ) => void
  onPurchaseError: (message: string) => void
  onWatchAd: () => void
  adQuota: number
  adCooldownMinutes: number
  message?: string | null
}

const isOwned = (meta: MetaProgressState, item: CosmeticItem): boolean => {
  if (item.category === 'skin') return meta.unlockedSkins.includes(item.unlockId)
  if (item.category === 'theme') return meta.ownedThemes.includes(item.unlockId)
  if (item.category === 'effect') return meta.ownedEffects.includes(item.unlockId)
  return false
}

const bundleOwned = (meta: MetaProgressState, bundle: TrackBundle): boolean =>
  bundle.trackIds.every((id) => meta.unlockedTracks.includes(id))

const formatPrice = (value: number): string => `${value.toLocaleString('ru-RU')} ◈`

const composeClassName = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ')

export function StoreScreen({
  meta,
  config,
  onBack,
  onCommitPurchase,
  onPurchaseError,
  onWatchAd,
  adQuota,
  adCooldownMinutes,
  message,
}: StoreScreenProps) {
  const handleCosmetic = (item: CosmeticItem) => {
    const price = resolveCosmeticPrice(item, config)
    const result = applyCosmeticPurchase(meta, item, price)
    if (!result.success) {
      onPurchaseError(result.error ?? 'Не удалось купить предмет')
      return
    }
    onCommitPurchase(result.updatedMeta, {
      description: `${item.title} · ${formatPrice(price)}`,
      sku: item.id,
      price,
      currency: 'soft',
      kind: 'soft',
    })
  }

  const handleBundle = (bundle: TrackBundle) => {
    const price = resolveBundlePrice(bundle, config)
    const result = applyTrackBundlePurchase(meta, bundle, price)
    if (!result.success) {
      onPurchaseError(result.error ?? 'Покупка недоступна')
      return
    }
    onCommitPurchase(result.updatedMeta, {
      description: `${bundle.title} · ${formatPrice(price)}`,
      sku: bundle.id,
      price,
      currency: 'soft',
      kind: 'soft',
    })
  }

  const handleStarterPack = () => {
    const offer = createStarterPackOffer(config)
    const result = applyStarterPackPurchase(meta, offer)
    if (!result.success) {
      onPurchaseError(result.error ?? 'Набор недоступен')
      return
    }
    onCommitPurchase(result.updatedMeta, {
      description: offer.title,
      sku: offer.id,
      price: offer.finalPrice,
      currency: 'USD',
      kind: 'real',
    })
  }

  const adButtonDisabled = adQuota <= 0

  const offer = createStarterPackOffer(config)

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0F14] text-slate-100">
      <header className="flex items-center justify-between px-6 pb-6 pt-10">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-slate-700/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Назад
        </button>
        <div className="flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-xs">
          <span className="font-semibold text-cyan-200">{meta.coins.toLocaleString('ru-RU')}</span>
          <span className="text-slate-400">◈</span>
        </div>
      </header>

      <main className="flex-1 space-y-10 px-6 pb-16">
        {message ? (
          <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
            {message}
          </div>
        ) : null}
        <section className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Новичковый набор</h2>
              <p className="text-xs text-slate-400">Скидка {offer.discountPercent}% и мгновенные разблокировки.</p>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
              {formatPrice(offer.content.coins)} бонусов
            </span>
          </div>
          <div className="mt-4 space-y-2 text-xs text-slate-300">
            <p>+{offer.content.coins} монет, скин, тема, эффект и два трека.</p>
            <p>
              {meta.starterPackPurchased
                ? 'Активировано'
                : `Цена ${offer.finalPrice.toFixed(2)}$ (обычно ${offer.basePrice.toFixed(2)}$)`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleStarterPack}
            disabled={meta.starterPackPurchased}
            className={composeClassName(
              'mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
              meta.starterPackPurchased
                ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                : 'bg-gradient-to-r from-emerald-400 to-cyan-500 text-slate-950 shadow-lg hover:shadow-xl',
            )}
          >
            {meta.starterPackPurchased ? 'Уже куплено' : 'Взять со скидкой'}
          </button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Косметика</h2>
            <span className="text-[0.65rem] text-slate-400">Скины, эффекты и темы</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {COSMETIC_ITEMS.map((item) => {
              const owned = isOwned(meta, item)
              const price = resolveCosmeticPrice(item, config)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleCosmetic(item)}
                  disabled={owned}
                  className={composeClassName(
                    'rounded-3xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                    owned
                      ? 'border-slate-700/60 bg-slate-900/50 text-slate-500'
                      : 'border-slate-700/60 bg-slate-900/80 text-slate-100 hover:border-cyan-400/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-xs text-slate-400">{item.description}</p>
                    </div>
                    <span className="text-xs font-semibold text-cyan-200">{formatPrice(price)}</span>
                  </div>
                  {owned ? <p className="mt-3 text-xs text-emerald-300">Куплено</p> : null}
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Пакеты треков</h2>
            <span className="text-[0.65rem] text-slate-400">Без pay-to-win — только новые сетлисты</span>
          </div>
          <div className="space-y-3">
            {TRACK_BUNDLES.map((bundle) => {
              const owned = bundleOwned(meta, bundle)
              const price = resolveBundlePrice(bundle, config)
              return (
                <button
                  key={bundle.id}
                  type="button"
                  onClick={() => handleBundle(bundle)}
                  disabled={owned}
                  className={composeClassName(
                    'w-full rounded-3xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                    owned
                      ? 'border-slate-700/60 bg-slate-900/50 text-slate-500'
                      : 'border-slate-700/60 bg-slate-900/80 text-slate-100 hover:border-violet-400/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{bundle.title}</p>
                      <p className="text-xs text-slate-400">{bundle.description}</p>
                      <p className="mt-2 text-[0.7rem] text-slate-400">Треки: {bundle.trackIds.join(', ')}</p>
                    </div>
                    <span className="text-xs font-semibold text-violet-200">{formatPrice(price)}</span>
                  </div>
                  {owned ? <p className="mt-3 text-xs text-emerald-300">Все треки открыты</p> : null}
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5 text-sm text-slate-200">
          <h2 className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Наградная реклама</h2>
          <p className="mt-2 text-xs text-slate-400">Посмотрите ролик и получите монеты без ограничения геймплея.</p>
          <button
            type="button"
            onClick={onWatchAd}
            disabled={adButtonDisabled}
            className={composeClassName(
              'mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
              adButtonDisabled
                ? 'cursor-not-allowed border border-slate-700/60 bg-slate-900/60 text-slate-500'
                : 'border border-cyan-400/60 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30',
            )}
          >
            +{config.ads.rewardAmounts.currencyBoost} ◈ за просмотр
          </button>
          <p className="mt-3 text-[0.65rem] text-slate-500">
            {adButtonDisabled
              ? `Доступно позже. Кулдаун ~${adCooldownMinutes} мин.`
              : `Осталось показов: ${adQuota}`}
          </p>
        </section>
      </main>
    </div>
  )
}

export default StoreScreen
