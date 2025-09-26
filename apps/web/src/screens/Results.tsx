import type { AudioTrackManifestEntry } from '../assets/tracks'
import type { ActiveUpgrade, UpgradeCard, WorldSnapshot } from '../world'
import type { RewardedAdPlacement } from '../services/remoteConfig'

interface ResultsScreenProps {
  track: AudioTrackManifestEntry
  snapshot: WorldSnapshot
  onRetry: () => void
  onHome: () => void
  onSongSelect: () => void
  onSelectUpgrade: (card: UpgradeCard) => void
  upgrades: ActiveUpgrade[]
  onOpenShare: () => void
  onWatchAd: (placement: RewardedAdPlacement) => void
  adAvailability: Record<RewardedAdPlacement, { remaining: number; cooldown: number }>
  adStatus?: string | null
}

const getStarCount = (accuracy: number): number => {
  const percentage = accuracy * 100
  if (percentage >= 98) return 3
  if (percentage >= 94) return 2
  if (percentage >= 88) return 1
  return 0
}

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`

export function ResultsScreen({
  track,
  snapshot,
  onRetry,
  onHome,
  onSongSelect,
  onSelectUpgrade,
  upgrades,
  onOpenShare,
  onWatchAd,
  adAvailability,
  adStatus,
}: ResultsScreenProps) {
  const stars = getStarCount(snapshot.accuracy)
  const starIcons = Array.from({ length: 3 }, (_, index) => index < stars)
  const hasChoices = snapshot.upgrades.offered.length > 0

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-[#0B0F14] px-6 py-16 text-slate-100">
      <header className="w-full max-w-xl text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Результат</p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{track.title}</h1>
        <p className="text-sm text-slate-300">{track.artist}</p>
      </header>

      <main className="w-full max-w-xl space-y-8">
        <div className="flex justify-center gap-2 text-3xl">
          {starIcons.map((active, index) => (
            <span key={index} className={active ? 'text-yellow-300' : 'text-slate-700'}>
              ★
            </span>
          ))}
        </div>

        <div className="grid gap-4 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 shadow-xl">
          <div className="flex items-center justify-between text-sm sm:text-base">
            <span className="text-slate-300">Очки</span>
            <span className="font-mono text-lg text-white">{Math.floor(snapshot.score).toLocaleString('ru-RU')}</span>
          </div>
          <div className="flex items-center justify-between text-sm sm:text-base">
            <span className="text-slate-300">Точность</span>
            <span className="font-semibold text-cyan-200">{formatPercent(snapshot.accuracy)}</span>
          </div>
          <div className="flex items-center justify-between text-sm sm:text-base">
            <span className="text-slate-300">Макс. комбо</span>
            <span className="font-semibold text-white">{snapshot.bestCombo}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 sm:text-sm">
            <span>Попаданий</span>
            <span>
              {snapshot.hits} / {snapshot.hits + snapshot.misses}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 sm:text-sm">
            <span>Фивер</span>
            <span>{snapshot.feverActivations}</span>
          </div>
        </div>

        {hasChoices ? (
          <section className="space-y-3 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6">
            <h2 className="text-sm font-semibold text-white">Выберите апгрейд</h2>
            <p className="text-xs text-slate-400">Активные карты: {upgrades.length}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {snapshot.upgrades.offered.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelectUpgrade(card)}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/80 p-4 text-left transition hover:border-cyan-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  <span className="text-sm font-semibold text-white">{card.name}</span>
                  <span className="text-xs text-slate-300">{card.description}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Наградная реклама</h2>
            <span className="text-xs text-slate-400">Только по желанию игрока</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              {
                placement: 'second_chance' as RewardedAdPlacement,
                label: 'Вторая жизнь',
                description: 'Перезапустить попытку без потери прогресса.',
              },
              {
                placement: 'unlock_track_session' as RewardedAdPlacement,
                label: 'Трек на сессию',
                description: 'Открыть один из треков до конца сессии.',
              },
              {
                placement: 'currency_boost' as RewardedAdPlacement,
                label: '+валюта',
                description: 'Получить мягкую валюту.',
              },
            ] satisfies Array<{ placement: RewardedAdPlacement; label: string; description: string }>).map(
              (option) => {
                const stats = adAvailability[option.placement]
                const disabled = !stats || stats.remaining <= 0
                return (
                  <button
                    key={option.placement}
                    type="button"
                    onClick={() => onWatchAd(option.placement)}
                    disabled={disabled}
                    className={`rounded-2xl border px-4 py-3 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                      disabled
                        ? 'cursor-not-allowed border-slate-700/60 bg-slate-900/60 text-slate-500'
                        : 'border-slate-700/60 bg-slate-900/80 text-slate-200 hover:border-cyan-400/40'
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{option.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{option.description}</p>
                    <p className="mt-2 text-[0.65rem] text-slate-500">
                      {disabled
                        ? `Подождите ~${Math.round(stats?.cooldown ?? 0)} мин.`
                        : `Доступно показов: ${stats?.remaining ?? 0}`}
                    </p>
                  </button>
                )
              },
            )}
          </div>
          {adStatus ? <p className="text-[0.7rem] text-emerald-300">{adStatus}</p> : null}
        </section>
      </main>

      <footer className="w-full max-w-xl space-y-3">
        <button
          type="button"
          onClick={onOpenShare}
          className="w-full rounded-full border border-slate-700/60 bg-slate-900/80 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Поделиться клипом
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Играть снова
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onHome}
            className="flex-1 rounded-full border border-slate-700/60 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Домой
          </button>
          <button
            type="button"
            onClick={onSongSelect}
            className="flex-1 rounded-full border border-slate-700/60 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Выбор трека
          </button>
        </div>
      </footer>
    </div>
  )
}

export default ResultsScreen
