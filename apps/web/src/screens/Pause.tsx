interface PauseScreenProps {
  onResume: () => void
  onRestart: () => void
  onQuit: () => void
}

export function PauseScreen({ onResume, onRestart, onQuit }: PauseScreenProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B0F14]/80 backdrop-blur-sm">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 text-center shadow-2xl">
        <h2 className="text-lg font-semibold text-white">Пауза</h2>
        <div className="space-y-3">
          <button
            type="button"
            onClick={onResume}
            className="w-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Продолжить
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full rounded-full border border-slate-700/70 bg-slate-900/80 px-5 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Сначала
          </button>
          <button
            type="button"
            onClick={onQuit}
            className="w-full rounded-full border border-rose-500/50 bg-rose-500/20 px-5 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Выйти
          </button>
        </div>
      </div>
    </div>
  )
}

export default PauseScreen
