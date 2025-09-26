import type ReplayClipExporter from '../share/ReplayClipExporter'
import type { ClipPreset } from '../share/ReplayClipExporter'

interface ShareScreenProps {
  exporter: ReplayClipExporter | null
  presets: ClipPreset[]
  exports: Array<{ presetId: string; url: string; createdAt: number }>
  onExport: (presetId: string) => Promise<void>
  onBack: () => void
  onCopyLink: () => void
  shareLink: string
  statusMessage?: string | null
}

const composeClassName = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ')

const formatTimestamp = (value: number): string => new Date(value).toLocaleTimeString('ru-RU')

export function ShareScreen({
  exporter,
  presets,
  exports,
  onExport,
  onBack,
  onCopyLink,
  shareLink,
  statusMessage,
}: ShareScreenProps) {
  const supported = exporter?.isSupported() ?? false

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
          onClick={onCopyLink}
          className="rounded-full border border-slate-700/70 px-4 py-2 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Скопировать ссылку
        </button>
      </header>

      <main className="flex-1 space-y-6 px-6 pb-16">
        <section className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 text-sm text-slate-200">
          <h1 className="text-xl font-semibold text-white">Экспорт хайлайтов</h1>
          <p className="mt-2 text-xs text-slate-400">Последние секунды сохраняются автоматически. Музыка заменяется SFX при необходимости.</p>
          <p className="mt-3 text-xs text-slate-500">Ссылка на игру: {shareLink}</p>
          {statusMessage ? <p className="mt-3 text-xs text-emerald-300">{statusMessage}</p> : null}
          {!supported ? (
            <p className="mt-4 text-xs text-red-400">Запись недоступна в этом браузере.</p>
          ) : null}
        </section>

        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Пресеты</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onExport(preset.id)}
                disabled={!supported}
                className={composeClassName(
                  'rounded-3xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                  supported
                    ? 'border-slate-700/60 bg-slate-900/80 text-slate-100 hover:border-cyan-400/40'
                    : 'cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{preset.label}</p>
                    <p className="text-xs text-slate-400">{preset.description}</p>
                  </div>
                  {preset.sticker ? <span className="text-lg">{preset.sticker}</span> : null}
                </div>
                <p className="mt-2 text-[0.7rem] text-slate-400">Длительность: {preset.duration} сек.</p>
                <p className="text-[0.7rem] text-slate-500">{preset.sfxOnly ? 'SFX микс' : 'Полный звук'}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Последние экспорты</h2>
          {exports.length === 0 ? (
            <p className="text-xs text-slate-500">Экспортируйте клип, чтобы поделиться с друзьями.</p>
          ) : (
            <ul className="space-y-2 text-xs text-slate-300">
              {exports.map((entry) => (
                <li
                  key={`${entry.presetId}-${entry.createdAt}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-700/60 bg-slate-900/80 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-white">{entry.presetId}</p>
                    <p className="text-[0.65rem] text-slate-400">{formatTimestamp(entry.createdAt)}</p>
                  </div>
                  {entry.url ? (
                    <a
                      className="rounded-full border border-cyan-400/60 px-3 py-1 text-[0.7rem] font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
                      href={entry.url}
                      download
                    >
                      Скачать
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

export default ShareScreen
