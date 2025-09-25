import type { AudioTrackManifestEntry } from '../assets/tracks'

interface HomeScreenProps {
  onStart: () => void
  onOpenSongSelect: () => void
  onOpenSettings: () => void
  lastTrack?: AudioTrackManifestEntry | null
}

export function HomeScreen({ onStart, onOpenSongSelect, onOpenSettings, lastTrack }: HomeScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-[#0B0F14] text-slate-100">
      <header className="w-full max-w-xl px-6 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">The Path</h1>
        <p className="mt-3 text-sm text-slate-300 sm:text-base">
          Вертикальная ритм-аркада: свайпайте по дорожкам и попадайте в ритм.
        </p>
      </header>

      <main className="w-full max-w-xl px-6">
        <button
          type="button"
          className="w-full rounded-3xl bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 py-4 text-lg font-semibold text-slate-950 shadow-xl shadow-cyan-500/40 transition hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          onClick={onStart}
        >
          Играть
        </button>

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
