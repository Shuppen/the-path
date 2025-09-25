interface SettingsScreenProps {
  dprCap: number
  onChangeDpr: (value: number) => void
  reducedMotion: boolean
  onChangeReducedMotion: (value: boolean) => void
  onBack: () => void
}

const DPR_OPTIONS = [1, 1.5, 2]

export function SettingsScreen({
  dprCap,
  onChangeDpr,
  reducedMotion,
  onChangeReducedMotion,
  onBack,
}: SettingsScreenProps) {
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
        <h1 className="text-base font-semibold text-white">Настройки</h1>
      </header>

      <main className="flex-1 space-y-10 px-6 pb-16">
        <section className="space-y-3 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6">
          <h2 className="text-sm font-semibold text-white">Ограничение DPR</h2>
          <p className="text-xs text-slate-400">Контролирует максимальный devicePixelRatio при рендеринге канваса.</p>
          <div className="flex gap-3">
            {DPR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChangeDpr(option)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                  option === dprCap
                    ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-lg'
                    : 'border border-slate-700/60 bg-slate-900/80 text-slate-200 hover:border-cyan-400/40'
                }`}
              >
                ×{option.toFixed(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Уменьшение анимаций</h2>
              <p className="text-xs text-slate-400">Включает более спокойные визуальные эффекты и упрощает анимацию дорожек.</p>
            </div>
            <button
              type="button"
              onClick={() => onChangeReducedMotion(!reducedMotion)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                reducedMotion ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/60' : 'border border-slate-700/60 bg-slate-900/80 text-slate-200 hover:border-cyan-400/40'
              }`}
            >
              {reducedMotion ? 'Вкл.' : 'Выкл.'}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default SettingsScreen
