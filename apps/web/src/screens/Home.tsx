import type { AudioTrackManifestEntry } from '../assets/tracks'
import type { ActiveUpgrade, MetaProgressState, WorldMode } from '../world'

interface HomeScreenProps {
  onStart: () => void
  onOpenSongSelect: () => void
  onOpenSettings: () => void
  onChangeMode: (mode: WorldMode) => void
  mode: WorldMode
  upgrades: ActiveUpgrade[]
  meta: MetaProgressState
  lastTrack?: AudioTrackManifestEntry | null
}

export function HomeScreen({
  onStart,
  onOpenSongSelect,
  onOpenSettings,
  onChangeMode,
  mode,
  upgrades,
  meta,
  lastTrack,
}: HomeScreenProps) {
  const nextLevelXp = Math.max(meta.level * 50, 1)
  const xpIntoLevel = meta.xp % nextLevelXp
  const progressPercent = Math.min(100, Math.round((xpIntoLevel / nextLevelXp) * 100))

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-[#0B0F14] text-slate-100">
      <header className="w-full max-w-xl px-6 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">The Path</h1>
        <p className="mt-3 text-sm text-slate-300 sm:text-base">
          Вертикальная ритм-аркада: свайпайте по дорожкам и попадайте в ритм.
        </p>
      </header>

      <main className="w-full max-w-xl space-y-8 px-6">
        <button
          type="button"
          className="w-full rounded-3xl bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 py-4 text-lg font-semibold text-slate-950 shadow-xl shadow-cyan-500/40 transition hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          onClick={onStart}
        >
          Играть
        </button>

        <section className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5">
          <h2 className="text-sm font-semibold text-white">Режим</h2>
          <p className="mt-1 text-xs text-slate-400">Выберите ритмовую петлю: по треку или бесконечный раннер.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onChangeMode('track')}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                mode === 'track'
                  ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-lg'
                  : 'border border-slate-700/60 bg-slate-900/80 text-slate-200 hover:border-cyan-400/50'
              }`}
            >
              Track
            </button>
            <button
              type="button"
              onClick={() => onChangeMode('endless')}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                mode === 'endless'
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-slate-950 shadow-lg'
                  : 'border border-slate-700/60 bg-slate-900/80 text-slate-200 hover:border-fuchsia-400/50'
              }`}
            >
              Endless
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Метапрогресс</h2>
              <p className="text-xs text-slate-400">Уровень {meta.level} · {meta.xp} XP</p>
            </div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-cyan-200">{progressPercent}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${progressPercent}%` }} />
          </div>
          {upgrades.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200">
              {upgrades.map((upgrade) => (
                <span
                  key={upgrade.id}
                  className="rounded-full bg-slate-800/80 px-3 py-1 font-medium text-cyan-200"
                >
                  {upgrade.name} ×{upgrade.stacks}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-400">Открывайте карты улучшений после прохождения треков.</p>
          )}
        </section>

        {lastTrack ? (
          <div className="mt-6 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-4 text-left shadow-lg">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Быстрый старт</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{lastTrack.title}</h2>
            <p className="text-sm text-slate-300">{lastTrack.artist}</p>
            <button
              type="button"
              onClick={onStart}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              Продолжить
            </button>
          </div>
        ) : null}
      </main>

      <footer className="w-full max-w-xl px-6 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <button
            type="button"
            onClick={onOpenSongSelect}
            className="rounded-full border border-slate-700/60 bg-slate-900/70 px-4 py-2 font-medium text-slate-200 transition hover:border-cyan-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Выбрать трек
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-full border border-slate-700/60 bg-slate-900/70 px-4 py-2 font-medium text-slate-200 transition hover:border-cyan-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Настройки
          </button>
        </div>
      </footer>
    </div>
  )
}

export default HomeScreen
