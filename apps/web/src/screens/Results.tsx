import type { AudioTrackManifestEntry } from '../assets/tracks'
import type { WorldSnapshot } from '../world'

interface ResultsScreenProps {
  track: AudioTrackManifestEntry
  snapshot: WorldSnapshot
  onRetry: () => void
  onHome: () => void
  onSongSelect: () => void
}

const getStarCount = (accuracy: number): number => {
  const percentage = accuracy * 100
  if (percentage >= 98) return 3
  if (percentage >= 94) return 2
  if (percentage >= 88) return 1
  return 0
}

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`

export function ResultsScreen({ track, snapshot, onRetry, onHome, onSongSelect }: ResultsScreenProps) {
  const stars = getStarCount(snapshot.accuracy)
  const starIcons = Array.from({ length: 3 }, (_, index) => index < stars)

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
        </div>
      </main>

      <footer className="w-full max-w-xl space-y-3">
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
