import type { MetaProgressState } from '../world'
import type { BattlePassRewardDefinition } from '../liveops/battlePass'

interface BattlePassScreenProps {
  meta: MetaProgressState
  rewards: BattlePassRewardDefinition[]
  seasonEndsAt: number
  onClaim: (rewardId: string) => void
  onUnlockPremium: () => void
  onBack: () => void
  onCopySeasonLink: () => void
  statusMessage?: string | null
}

const composeClassName = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ')

const formatDuration = (target: number): string => {
  const now = Date.now()
  const delta = Math.max(0, target - now)
  const days = Math.floor(delta / (24 * 60 * 60 * 1000))
  const hours = Math.floor((delta % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  return `${days}д ${hours}ч`
}

export function BattlePassScreen({
  meta,
  rewards,
  seasonEndsAt,
  onClaim,
  onUnlockPremium,
  onBack,
  onCopySeasonLink,
  statusMessage,
}: BattlePassScreenProps) {
  const claimedFree = new Set(meta.battlePass.freeClaimed)
  const claimedPremium = new Set(meta.battlePass.premiumClaimed)
  const isPremium = meta.battlePass.premiumUnlocked

  const tiers = rewards.map((reward) => {
    const claimed = reward.lane === 'free' ? claimedFree.has(reward.id) : claimedPremium.has(reward.id)
    const canClaim = meta.battlePass.xp >= reward.xpRequired && (!claimed && (reward.lane === 'free' || isPremium))
    return { reward, claimed, canClaim }
  })

  const xpGoal = Math.max(...rewards.map((reward) => reward.xpRequired), 1)
  const progress = Math.min(1, meta.battlePass.xp / xpGoal)

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
        <button
          type="button"
          onClick={onCopySeasonLink}
          className="rounded-full border border-slate-700/70 px-4 py-2 text-xs text-slate-200 transition hover:border-violet-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Поделиться сезоном
        </button>
      </header>

      <main className="flex-1 space-y-10 px-6 pb-16">
        <section className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Сезонный прогресс</p>
              <h1 className="text-2xl font-semibold text-white">Battle Pass: {meta.battlePass.seasonId}</h1>
              <p className="mt-2 text-sm text-slate-300">До завершения: {formatDuration(seasonEndsAt)}</p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <p>XP: {meta.battlePass.xp}</p>
              <p>Премиум: {isPremium ? 'активен' : 'заблокирован'}</p>
            </div>
          </div>
          {statusMessage ? (
            <p className="mt-3 text-xs text-emerald-300">{statusMessage}</p>
          ) : null}
          <div className="mt-6 h-3 rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-violet-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onUnlockPremium}
            disabled={isPremium}
            className={composeClassName(
              'mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
              isPremium
                ? 'cursor-not-allowed border border-slate-700/60 bg-slate-900/60 text-slate-500'
                : 'border border-violet-400/60 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30',
            )}
          >
            {isPremium ? 'Премиум активирован' : 'Открыть премиум дорожку'}
          </button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Награды</h2>
            <span className="text-[0.65rem] text-slate-400">Косметика, монеты и редкий трек</span>
          </div>
          <div className="space-y-3">
            {tiers.map(({ reward, claimed, canClaim }) => (
              <div
                key={reward.id}
                className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5 text-sm text-slate-200"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">{reward.lane === 'free' ? 'FREE' : 'PREMIUM'}</p>
                    <h3 className="text-lg font-semibold text-white">{reward.title}</h3>
                    <p className="text-xs text-slate-400">{reward.description}</p>
                    <p className="mt-2 text-xs text-slate-500">Требуется XP: {reward.xpRequired}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onClaim(reward.id)}
                    disabled={!canClaim}
                    className={composeClassName(
                      'rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                      claimed
                        ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                        : canClaim
                          ? 'border border-cyan-400/60 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30'
                          : 'cursor-not-allowed border border-slate-700/60 bg-slate-900/60 text-slate-500',
                    )}
                  >
                    {claimed ? 'Получено' : canClaim ? 'Получить' : 'Недоступно'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default BattlePassScreen
