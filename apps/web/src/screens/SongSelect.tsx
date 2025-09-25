import type { AudioTrackManifestEntry } from '../assets/tracks'
import type { StoredRecentTrack } from '../audio/recentTracks'
import TrackUpload from '../ui/TrackUpload'

const formatTime = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0:00'
  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

interface SongSelectScreenProps {
  builtInTracks: AudioTrackManifestEntry[]
  uploadedTracks: AudioTrackManifestEntry[]
  selectedTrackId: string
  onSelectTrack: (id: string) => void
  onBack: () => void
  onStart: () => void
  onUpload: (file: File) => void
  uploadError: string | null
  onClearUploadError: () => void
  isProcessingUpload: boolean
  audioSupported: boolean
  recentTracks: StoredRecentTrack[]
  onSelectRecentTrack: (track: StoredRecentTrack) => void
}

const listClasses = 'grid gap-3'

export function SongSelectScreen({
  builtInTracks,
  uploadedTracks,
  selectedTrackId,
  onSelectTrack,
  onBack,
  onStart,
  onUpload,
  uploadError,
  onClearUploadError,
  isProcessingUpload,
  audioSupported,
  recentTracks,
  onSelectRecentTrack,
}: SongSelectScreenProps) {
  const renderTrackButton = (track: AudioTrackManifestEntry, accent: 'default' | 'uploaded' = 'default') => {
    const isSelected = track.id === selectedTrackId
    const baseClasses =
      'flex items-center justify-between rounded-3xl px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900'
    const palette =
      accent === 'uploaded'
        ? isSelected
          ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/70 shadow-lg shadow-emerald-500/30'
          : 'border border-slate-700/60 bg-slate-900/70 text-slate-200 hover:border-emerald-400/40'
        : isSelected
          ? 'bg-sky-500/20 text-sky-100 border border-sky-400/70 shadow-lg shadow-sky-500/30'
          : 'border border-slate-700/60 bg-slate-900/70 text-slate-200 hover:border-sky-400/40'

    return (
      <button key={track.id} type="button" className={`${baseClasses} ${palette}`} onClick={() => onSelectTrack(track.id)}>
        <span className="flex flex-col">
          <span className="text-sm font-semibold sm:text-base">{track.title}</span>
          <span className="text-xs text-slate-400 sm:text-sm">{track.artist}</span>
        </span>
        <span className="text-xs font-mono text-slate-300">{formatTime(track.duration)}</span>
      </button>
    )
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
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Старт
        </button>
      </header>

      <main className="flex-1 space-y-10 px-6 pb-16">
        {uploadedTracks.length > 0 ? (
          <section>
            <h2 className="text-xs uppercase tracking-[0.35em] text-emerald-300/70">Локальные</h2>
            <div className={`${listClasses} mt-3`}>{uploadedTracks.map((track) => renderTrackButton(track, 'uploaded'))}</div>
          </section>
        ) : null}

        <section>
          <h2 className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Плейлист</h2>
          <div className={`${listClasses} mt-3`}>{builtInTracks.map((track) => renderTrackButton(track))}</div>
        </section>

        <section className="space-y-4">
          <TrackUpload
            onFileAccepted={onUpload}
            disabled={!audioSupported}
            processing={isProcessingUpload}
            error={uploadError}
            onClearError={onClearUploadError}
          />

          {recentTracks.length > 0 ? (
            <div className="rounded-3xl border border-slate-700/70 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Недавние загрузки</p>
              <div className="mt-3 space-y-2">
                {recentTracks.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelectRecentTrack(entry)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-cyan-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{entry.title}</span>
                      <span className="text-slate-400">~{Math.round(entry.bpm)} BPM · {formatTime(entry.duration)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default SongSelectScreen
