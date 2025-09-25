import type { CalibrationSettings } from '../world'
import { CALIBRATION_LIMIT_MS } from '../world/constants'

interface SettingsScreenProps {
  dprCap: number
  onChangeDpr: (value: number) => void
  reducedMotion: boolean
  onChangeReducedMotion: (value: boolean) => void
  calibration: CalibrationSettings
  onChangeCalibration: (value: CalibrationSettings) => void
  onBack: () => void
}

const DPR_OPTIONS = [1, 1.5, 2]

export function SettingsScreen({
  dprCap,
  onChangeDpr,
  reducedMotion,
  onChangeReducedMotion,
  calibration,
  onChangeCalibration,
  onBack,
}: SettingsScreenProps) {
  const handleCalibrationChange = (key: keyof CalibrationSettings, value: number) => {
    const clamped = Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, Math.round(value)))
    onChangeCalibration({ ...calibration, [key]: clamped })
  }

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
                reducedMotion
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/60'
                  : 'border border-slate-700/60 bg-slate-900/80 text-slate-200 hover:border-cyan-400/40'
              }`}
            >
              {reducedMotion ? 'Вкл.' : 'Выкл.'}
            </button>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6">
          <h2 className="text-sm font-semibold text-white">Калибровка</h2>
          <p className="text-xs text-slate-400">Сдвиг входа и аудио (±{CALIBRATION_LIMIT_MS} мс) для компенсации задержки устройства.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs text-slate-300">
              <span>Input offset</span>
              <input
                type="number"
                value={calibration.inputOffsetMs}
                min={-CALIBRATION_LIMIT_MS}
                max={CALIBRATION_LIMIT_MS}
                step={1}
                onChange={(event) => handleCalibrationChange('inputOffsetMs', Number(event.target.value))}
                className="rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs text-slate-300">
              <span>Audio offset</span>
              <input
                type="number"
                value={calibration.audioOffsetMs}
                min={-CALIBRATION_LIMIT_MS}
                max={CALIBRATION_LIMIT_MS}
                step={1}
                onChange={(event) => handleCalibrationChange('audioOffsetMs', Number(event.target.value))}
                className="rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </label>
          </div>
        </section>
      </main>
    </div>
  )
}

export default SettingsScreen
