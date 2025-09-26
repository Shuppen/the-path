import { useEffect, useRef, useState } from 'react'
import type { CalibrationSettings } from '../world'
import { CALIBRATION_LIMIT_MS } from '../world/constants'
import type { AudioSettings } from '../audio/preferences'
import type { EqPreset } from '../audio/eqPresets'
import type { WebAudioAnalysis } from '../audio/WebAudioAnalysis'

interface SettingsScreenProps {
  dprCap: number
  onChangeDpr: (value: number) => void
  reducedMotion: boolean
  onChangeReducedMotion: (value: boolean) => void
  calibration: CalibrationSettings
  onChangeCalibration: (value: CalibrationSettings) => void
  audio: WebAudioAnalysis
  audioSettings: AudioSettings
  onChangeAudioSettings: (value: AudioSettings) => void
  eqPresets: EqPreset[]
  onBack: () => void
}

const DPR_OPTIONS = [1, 1.5, 2]

const BEAT_PERIOD_MS = 1200

interface CalibrationPadProps {
  audio: WebAudioAnalysis
  offset: number
  onApply: (offset: number) => void
}

const mod = (value: number, base: number): number => ((value % base) + base) % base

const CalibrationPad = ({ audio, offset, onApply }: CalibrationPadProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [pending, setPending] = useState(offset)
  const rafRef = useRef<number>(0)
  const lastAudioPhase = useRef(0)
  const startTimeRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setPending(offset)
  }, [offset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const render = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }
      const elapsed = timestamp - startTimeRef.current
      const phase = mod(elapsed, BEAT_PERIOD_MS) / BEAT_PERIOD_MS
      const offsetPhase = mod(phase + pending / BEAT_PERIOD_MS, 1)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(12, 19, 28, 0.85)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const radius = Math.min(canvas.width, canvas.height) * 0.35
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.stroke()

      const drawMarker = (angle: number, color: string) => {
        const x = centerX + Math.cos(angle) * radius
        const y = centerY + Math.sin(angle) * radius
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, 8, 0, Math.PI * 2)
        ctx.fill()
      }

      drawMarker(phase * Math.PI * 2 - Math.PI / 2, 'rgba(59, 130, 246, 0.85)')
      drawMarker(offsetPhase * Math.PI * 2 - Math.PI / 2, 'rgba(248, 113, 113, 0.8)')

      if (offsetPhase < lastAudioPhase.current) {
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current)
        }
        const delay = Math.max(0, pending)
        timeoutRef.current = window.setTimeout(() => {
          audio.playSfx('tap', { intensity: 0.7 })
        }, delay)
        if (pending <= 0) {
          audio.playSfx('tap', { intensity: 0.7 })
        }
      }
      lastAudioPhase.current = offsetPhase

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      startTimeRef.current = null
      lastAudioPhase.current = 0
    }
  }, [audio, pending])

  return (
    <div className="space-y-3">
      <div className="relative mx-auto flex h-40 w-full max-w-xs items-center justify-center overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/60">
        <canvas ref={canvasRef} width={240} height={160} className="absolute inset-0 h-full w-full" />
        <div className="relative z-10 text-center text-xs text-slate-300">
          <p>Синяя метка — визуал, красная — звук.</p>
          <p>Подберите смещение, чтобы слышимое совпало с визуалом.</p>
        </div>
      </div>
      <label className="flex flex-col gap-2 text-xs text-slate-300">
        <span>
          Смещение аудио: <span className="font-mono text-slate-200">{pending.toFixed(0)} мс</span>
        </span>
        <input
          type="range"
          min={-200}
          max={200}
          step={1}
          value={pending}
          onChange={(event) => setPending(Number(event.target.value))}
          className="accent-cyan-400"
        />
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setPending(0)}
          className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-200 transition hover:border-cyan-400/50"
        >
          Сбросить
        </button>
        <button
          type="button"
          onClick={() => onApply(Math.round(pending))}
          className="ml-auto rounded-full bg-cyan-500/80 px-4 py-1 text-xs font-semibold text-slate-950 shadow"
        >
          Сохранить смещение
        </button>
      </div>
    </div>
  )
}

export function SettingsScreen({
  dprCap,
  onChangeDpr,
  reducedMotion,
  onChangeReducedMotion,
  calibration,
  onChangeCalibration,
  audio,
  audioSettings,
  onChangeAudioSettings,
  eqPresets,
  onBack,
}: SettingsScreenProps) {
  const handleCalibrationChange = (key: keyof CalibrationSettings, value: number) => {
    const clamped = Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, Math.round(value)))
    onChangeCalibration({ ...calibration, [key]: clamped })
  }

  const handleVolumeChange = (key: keyof Pick<AudioSettings, 'music' | 'sfx' | 'voice'>, value: number) => {
    const next = { ...audioSettings, [key]: Math.round(value * 100) / 100 }
    onChangeAudioSettings(next)
  }

  const handleEqPresetChange = (presetId: string) => {
    if (presetId === 'custom') {
      const current = audioSettings.customEq ?? { low: 0, mid: 0, high: 0 }
      onChangeAudioSettings({ ...audioSettings, eqPreset: 'custom', customEq: current })
      return
    }
    onChangeAudioSettings({ ...audioSettings, eqPreset: presetId, customEq: undefined })
  }

  const handleCustomEqChange = (band: 'low' | 'mid' | 'high', value: number) => {
    const custom = audioSettings.customEq ?? { low: 0, mid: 0, high: 0 }
    onChangeAudioSettings({
      ...audioSettings,
      eqPreset: 'custom',
      customEq: { ...custom, [band]: value },
    })
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
          <h2 className="text-sm font-semibold text-white">Громкость</h2>
          <p className="text-xs text-slate-400">Раздельные уровни для музыки, эффектов и голосовых подсказок.</p>
          <div className="space-y-4">
            {[
              { key: 'music', label: 'Музыка', value: audioSettings.music },
              { key: 'sfx', label: 'SFX', value: audioSettings.sfx },
              { key: 'voice', label: 'Голоса', value: audioSettings.voice },
            ].map((entry) => (
              <label key={entry.key} className="flex flex-col gap-2 text-xs text-slate-300">
                <span>
                  {entry.label}{' '}
                  <span className="font-mono text-slate-200">{Math.round(entry.value * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={entry.value}
                  onChange={(event) => handleVolumeChange(entry.key as 'music' | 'sfx' | 'voice', Number(event.target.value))}
                  className="accent-cyan-400"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6">
          <h2 className="text-sm font-semibold text-white">Эквалайзер</h2>
          <p className="text-xs text-slate-400">Выберите готовый пресет или настройте вручную.</p>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {eqPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleEqPresetChange(preset.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                    audioSettings.eqPreset === preset.id
                      ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow'
                      : 'border border-slate-700/60 bg-slate-900/70 text-slate-200 hover:border-cyan-400/50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleEqPresetChange('custom')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                  audioSettings.eqPreset === 'custom'
                    ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow'
                    : 'border border-slate-700/60 bg-slate-900/70 text-slate-200 hover:border-cyan-400/50'
                }`}
              >
                Custom
              </button>
            </div>
            {audioSettings.eqPreset === 'custom' ? (
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { key: 'low', label: 'Низ' },
                  { key: 'mid', label: 'Середина' },
                  { key: 'high', label: 'Верх' },
                ].map((band) => (
                  <label key={band.key} className="flex flex-col gap-2 text-xs text-slate-300">
                    <span>
                      {band.label} {audioSettings.customEq ? Math.round(audioSettings.customEq[band.key as 'low' | 'mid' | 'high'] * 10) / 10 : 0} дБ
                    </span>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={audioSettings.customEq ? audioSettings.customEq[band.key as 'low' | 'mid' | 'high'] : 0}
                      onChange={(event) => handleCustomEqChange(band.key as 'low' | 'mid' | 'high', Number(event.target.value))}
                      className="accent-cyan-400"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6">
          <h2 className="text-sm font-semibold text-white">Калибровка</h2>
          <p className="text-xs text-slate-400">Подберите смещение, чтобы визуальный и аудио-ритм совпали.</p>
          <CalibrationPad
            audio={audio}
            offset={calibration.audioOffsetMs}
            onApply={(offsetMs) => handleCalibrationChange('audioOffsetMs', offsetMs)}
          />
          <p className="text-xs text-slate-400">Точные значения можно указать вручную (±{CALIBRATION_LIMIT_MS} мс).</p>
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
