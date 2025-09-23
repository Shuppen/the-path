import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewportMetrics } from '@the-path/types'
import { getViewportMetrics, resizeCanvasToDisplaySize } from '@the-path/utils'

import { createSeed } from './core/prng'
import { createGameLoop } from './engine/loop'
import { InputManager } from './engine/input'
import { SceneRenderer } from './render/sceneRenderer'
import { World, type WorldSnapshot } from './world'
import { WebAudioAnalysis, type AudioPlaybackState, type ProgressEvent as AudioProgressEvent } from './audio/WebAudioAnalysis'
import { DEFAULT_TRACK_ID, TRACK_MANIFEST, type AudioTrackManifestEntry } from './assets/tracks'
import CanvasRecorder, { type RecorderState } from './share/CanvasRecorder'
import TrackUpload from './ui/TrackUpload'
import { validateAudioDuration } from './audio/uploadValidation'
import {
  type StoredRecentTrack,
  MAX_RECENT_TRACKS,
  readRecentTracks,
  toManifest,
  upsertRecentTrack,
  writeRecentTracks,
} from './audio/recentTracks'

const padScore = (value: number): string => value.toString().padStart(6, '0')

const clamp01 = (value: number): number => {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

const formatTime = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0:00'
  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const describeAudioState = (state: AudioPlaybackState): string => {
  switch (state) {
    case 'loading':
      return 'Loading track…'
    case 'ready':
      return 'Ready to play'
    case 'playing':
      return 'Playing'
    case 'paused':
      return 'Paused'
    case 'ended':
      return 'Playback finished'
    default:
      return 'Idle'
  }
}

const deriveTrackTitle = (fileName: string): string => {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, '')
  const normalized = withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return 'Uploaded track'
  }
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const describeUploadedTrack = (duration: number, bpm: number): string => {
  const roundedBpm = Math.round(bpm)
  return `User uploaded · ${formatTime(duration)} · ~${roundedBpm} BPM`
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const metricsRef = useRef<ViewportMetrics | null>(null)
  const worldRef = useRef<World | null>(null)
  const seedRef = useRef<string>(createSeed())
  const audioRef = useRef<WebAudioAnalysis | null>(null)
  const recorderRef = useRef<CanvasRecorder | null>(null)

  if (typeof window !== 'undefined' && audioRef.current === null) {
    audioRef.current = new WebAudioAnalysis()
  }

  const audioSupported = audioRef.current?.isSupported() ?? false
  const defaultTrack = TRACK_MANIFEST.find((track) => track.id === DEFAULT_TRACK_ID) ?? TRACK_MANIFEST[0]
  const [selectedTrackId, setSelectedTrackId] = useState<string>(defaultTrack?.id ?? DEFAULT_TRACK_ID)
  const [uploadedTracks, setUploadedTracks] = useState<AudioTrackManifestEntry[]>([])
  const [recentTracks, setRecentTracks] = useState<StoredRecentTrack[]>(() => readRecentTracks())
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isProcessingUpload, setIsProcessingUpload] = useState(false)
  const selectedTrack = useMemo(() => {
    const uploaded = uploadedTracks.find((track) => track.id === selectedTrackId)
    if (uploaded) return uploaded
    return TRACK_MANIFEST.find((track) => track.id === selectedTrackId) ?? defaultTrack
  }, [uploadedTracks, selectedTrackId, defaultTrack])
  const [audioState, setAudioState] = useState<AudioPlaybackState>(
    () => audioRef.current?.getState() ?? 'idle',
  )
  const [audioProgress, setAudioProgress] = useState<AudioProgressEvent>(() => {
    const duration = audioRef.current?.getDuration() ?? selectedTrack?.duration ?? 0
    const time = audioRef.current?.getCurrentTime() ?? 0
    const progress = duration > 0 ? clamp01(time / duration) : 0
    return { time, duration, progress }
  })
  const [worldReady, setWorldReady] = useState(false)

  const [recordingState, setRecordingState] = useState<RecorderState>('idle')
  const [recordingSupported, setRecordingSupported] = useState(false)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [bufferInfo, setBufferInfo] = useState({ duration: 0, limit: 20 })
  const [isSavingClip, setIsSavingClip] = useState(false)

  const [hud, setHud] = useState<WorldSnapshot>(() => ({
    score: 0,
    combo: 0,
    bestCombo: 0,
    status: 'running',
    seed: seedRef.current,
  }))

  useEffect(() => {
    writeRecentTracks(recentTracks)
  }, [recentTracks])

  useEffect(() => {
    const hasUploaded = uploadedTracks.some((track) => track.id === selectedTrackId)
    const hasBuiltIn = TRACK_MANIFEST.some((track) => track.id === selectedTrackId)
    if (!hasUploaded && !hasBuiltIn && selectedTrack) {
      setSelectedTrackId(selectedTrack.id)
    }
  }, [selectedTrackId, uploadedTracks, selectedTrack])

  const handleUploadFile = useCallback(
    async (file: File) => {
      const audio = audioRef.current
      if (!audio || !audioSupported) {
        setUploadError('Web Audio API недоступна в этом браузере.')
        return
      }

      setIsProcessingUpload(true)
      setUploadError(null)

      try {
        const { id, duration, bpm } = await audio.importFromBlob(file)
        const durationError = validateAudioDuration(duration)
        if (durationError) {
          audio.removeCustomTrack(id)
          setUploadError(durationError)
          return
        }

        const manifest: AudioTrackManifestEntry = {
          id,
          title: deriveTrackTitle(file.name),
          artist: 'Local upload',
          duration,
          bpm: Math.round(bpm),
          description: describeUploadedTrack(duration, bpm),
        }

        setUploadedTracks((previous) => {
          const retained = previous.filter(
            (track) => track.id !== manifest.id && audio.hasCustomTrack(track.id),
          )
          return [manifest, ...retained].slice(0, MAX_RECENT_TRACKS)
        })

        const storedEntry: StoredRecentTrack = {
          id: manifest.id,
          title: manifest.title,
          artist: manifest.artist,
          duration: manifest.duration,
          bpm: manifest.bpm,
          createdAt: Date.now(),
        }
        setRecentTracks((previous) => upsertRecentTrack(previous, storedEntry, MAX_RECENT_TRACKS))
        setSelectedTrackId(manifest.id)
        setUploadError(null)
      } catch (error) {
        if (error instanceof Error) {
          setUploadError(error.message)
        } else {
          setUploadError('Не удалось загрузить трек.')
        }
      } finally {
        setIsProcessingUpload(false)
      }
    },
    [audioSupported],
  )

  const handleSelectRecentTrack = useCallback(
    (entry: StoredRecentTrack) => {
      const audio = audioRef.current
      if (!audio || !audioSupported) {
        setUploadError('Web Audio API недоступна в этом браузере.')
        return
      }

      if (!audio.hasCustomTrack(entry.id)) {
        setUploadError('Файл недоступен. Загрузите трек повторно.')
        return
      }

      setUploadedTracks((previous) => {
        if (previous.some((track) => track.id === entry.id)) {
          return previous.filter((track) => audio.hasCustomTrack(track.id))
        }
        const manifest = {
          ...toManifest(entry),
          description: describeUploadedTrack(entry.duration, entry.bpm),
        }
        const retained = previous.filter((track) => audio.hasCustomTrack(track.id))
        return [manifest, ...retained].slice(0, MAX_RECENT_TRACKS)
      })

      setUploadError(null)
      setSelectedTrackId(entry.id)
    },
    [audioSupported],
  )

  const pushHud = useCallback((world: World) => {
    const snapshot = world.snapshot()
    setHud((previous) => {
      if (
        previous.score === snapshot.score &&
        previous.combo === snapshot.combo &&
        previous.bestCombo === snapshot.bestCombo &&
        previous.status === snapshot.status &&
        previous.seed === snapshot.seed
      ) {
        return previous
      }
      return snapshot
    })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const recorder = new CanvasRecorder(canvas, {
      bufferDuration: 20,
      audioStreamFactory: () => {
        const audio = audioRef.current
        if (!audio || !audio.isSupported()) return null
        const recording = audio.createRecordingStream()
        if (!recording) return null
        return {
          stream: recording.stream,
          cleanup: recording.disconnect,
        }
      },
    })

    recorderRef.current = recorder
    const supported = recorder.isSupported()
    setRecordingSupported(supported)
    if (!supported) {
      setRecordingError('Recording is not supported in this browser')
    }
    setBufferInfo({ duration: recorder.getBufferedTime(), limit: recorder.getBufferDuration() })

    const detachState = recorder.onStateChange((state) => {
      setRecordingState(state)
      if (state === 'recording') {
        setRecordingError(null)
      }
    })
    const detachBuffer = recorder.onBufferUpdate((info) => {
      setBufferInfo(info)
    })
    const detachError = recorder.onError(({ error }) => {
      setRecordingError(error.message)
    })

    return () => {
      detachState()
      detachBuffer()
      detachError()
      recorder.destroy()
      if (recorderRef.current === recorder) {
        recorderRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.isSupported()) return undefined

    setAudioState(audio.getState())
    setAudioProgress({
      time: audio.getCurrentTime(),
      duration: audio.getDuration(),
      progress: audio.getDuration() > 0 ? clamp01(audio.getCurrentTime() / audio.getDuration()) : 0,
    })

    const detachProgress = audio.onProgress((event) => {
      setAudioProgress(event)
    })
    const detachState = audio.onStateChange((state) => {
      setAudioState(state)
    })

    return () => {
      detachProgress()
      detachState()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return undefined

    const metrics = getViewportMetrics(canvas)
    metricsRef.current = metrics
    resizeCanvasToDisplaySize(canvas, metrics)

    const world = new World({
      seed: seedRef.current,
      width: canvas.width || Math.max(metrics.width, 1),
      height: canvas.height || Math.max(metrics.height, 1),
    })
    worldRef.current = world

    const audio = audioRef.current
    let detachAudioEvents: (() => void) | undefined
    if (audio && audio.isSupported()) {
      world.attachTimeSource(() => {
        const state = audio.getState()
        if (state === 'idle' || state === 'loading') return null
        return audio.getCurrentTime()
      })
      const detachBeat = audio.onBeat(({ time, confidence }) => {
        world.syncToBeat(time, confidence)
      })
      const detachEnergy = audio.onEnergySpike(({ intensity }) => {
        world.applyEnergySpike(intensity)
      })
      const detachBreak = audio.onBreak(({ duration }) => {
        world.applyBreak(duration)
      })
      detachAudioEvents = () => {
        detachBeat()
        detachEnergy()
        detachBreak()
      }
    } else {
      world.attachTimeSource(undefined)
    }

    const renderer = new SceneRenderer(context)
    const input = new InputManager(canvas, () => metricsRef.current)
    input.bind()

    const updateHud = () => pushHud(world)
    updateHud()
    renderer.render(world.state)

    const updateMetrics = () => {
      const next = getViewportMetrics(canvas)
      metricsRef.current = next
      resizeCanvasToDisplaySize(canvas, next)
      world.setViewport(canvas.width, canvas.height)
    }

    updateMetrics()

    const resizeObserver = new ResizeObserver(() => updateMetrics())
    resizeObserver.observe(canvas)
    window.addEventListener('resize', updateMetrics)

    const loop = createGameLoop({
      update: (dt) => {
        const snapshot = input.consumeActions()
        world.update({ ...snapshot, dt })
        updateHud()
      },
      render: (alpha) => {
        renderer.render(world.state, alpha)
      },
    })
    loop.start()
    setWorldReady(true)

    return () => {
      loop.stop()
      input.unbind()
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateMetrics)
      if (detachAudioEvents) detachAudioEvents()
      setWorldReady(false)
      if (worldRef.current === world) worldRef.current = null
    }
  }, [pushHud])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !selectedTrack) return undefined

    if (!audio.isSupported()) {
      setAudioProgress({ time: 0, duration: selectedTrack.duration, progress: 0 })
      void audio.load(selectedTrack)
      return undefined
    }

    let cancelled = false

    void audio.load(selectedTrack).then(() => {
      if (cancelled) return
      setAudioProgress({
        time: audio.getCurrentTime(),
        duration: audio.getDuration(),
        progress: audio.getDuration() > 0 ? clamp01(audio.getCurrentTime() / audio.getDuration()) : 0,
      })
    })

    return () => {
      cancelled = true
    }
  }, [selectedTrack])

  useEffect(() => {
    const world = worldRef.current
    if (!world || !selectedTrack) return
    world.reset(undefined, { bpm: selectedTrack.bpm })
  }, [selectedTrack, worldReady])

  const handleRestart = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    world.reset()
    pushHud(world)
  }, [pushHud])

  const handleNewSeed = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    const nextSeed = createSeed()
    seedRef.current = nextSeed
    world.reset(nextSeed)
    pushHud(world)
  }, [pushHud])

  const handleTogglePlayback = useCallback(() => {
    const audio = audioRef.current
    const world = worldRef.current
    if (!audio || !selectedTrack || !audio.isSupported()) return

    const state = audio.getState()
    if (state === 'idle' || state === 'loading') {
      return
    }

    if (state === 'playing') {
      audio.pause()
      return
    }

    if (state === 'ended') {
      audio.setCurrentTime(0)
      world?.reset(undefined, { bpm: selectedTrack.bpm })
    }

    audio.play().catch((error) => {
      console.error(error)
    })
  }, [selectedTrack])

  const handleRestartTrack = useCallback(() => {
    const audio = audioRef.current
    const world = worldRef.current
    if (!audio || !selectedTrack) return

    audio.stop()
    audio.setCurrentTime(0)
    world?.reset(undefined, { bpm: selectedTrack.bpm })
    setAudioProgress({
      time: 0,
      duration: audio.getDuration(),
      progress: 0,
    })
  }, [selectedTrack])

  const handleSelectTrack = useCallback((trackId: string) => {
    setUploadError(null)
    setSelectedTrackId(trackId)
  }, [])

  const handleToggleRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.getState() === 'recording') {
      recorder.stop()
      return
    }
    const started = recorder.start()
    if (!started) {
      setRecordingError(recorder.getLastError()?.message ?? 'Unable to start recording')
    }
  }, [])

  const handleSaveClip = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    try {
      setRecordingError(null)
      setIsSavingClip(true)
      const blob = recorder.exportClip()
      if (!blob || blob.size === 0) {
        setRecordingError('No recording data available yet')
        return
      }
      const fileName = `the-path-${Date.now()}.webm`
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        typeof navigator.share === 'function' &&
        typeof File !== 'undefined'
      ) {
        const file = new File([blob], fileName, { type: blob.type })
        const shareData = { files: [file], title: 'The Path clip' }
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData)
          return
        }
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSavingClip(false)
    }
  }, [])

  const playbackStatus = audioSupported ? describeAudioState(audioState) : 'Audio unavailable'
  const bufferLimit = bufferInfo.limit > 0 ? bufferInfo.limit : 0
  const bufferedSeconds = bufferLimit > 0 ? Math.min(bufferInfo.duration, bufferLimit) : bufferInfo.duration
  const bufferRatio = bufferLimit > 0 && Number.isFinite(bufferLimit)
    ? Math.min(bufferedSeconds / bufferLimit, 1)
    : 0
  const recordButtonLabel = recordingState === 'recording' ? 'Stop recording' : 'Record gameplay'
  const recordingStatus = !recordingSupported
    ? 'Recording unavailable'
    : isSavingClip
      ? 'Saving clip…'
      : recordingState === 'recording'
        ? 'Recording in progress'
        : recordingError
          ? 'Recorder error'
          : 'Recorder idle'
  const saveDisabled = !recordingSupported || bufferInfo.duration <= 0 || isSavingClip
  const bufferedLabel = Number.isFinite(bufferedSeconds) ? bufferedSeconds.toFixed(1) : '0.0'
  const bufferLimitLabel = Number.isFinite(bufferLimit) ? bufferLimit.toFixed(0) : '0'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12">
        <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-xl ring-1 ring-white/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Soundtrack</p>
              <h2 className="text-2xl font-semibold text-slate-50 sm:text-3xl">{selectedTrack?.title}</h2>
              <p className="text-sm text-slate-400">{selectedTrack?.artist}</p>
              {selectedTrack?.description ? (
                <p className="text-sm text-slate-400/80">{selectedTrack.description}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlayback}
                disabled={audioState === 'loading' || !audioSupported}
                className="inline-flex items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {audioSupported
                  ? audioState === 'playing'
                    ? 'Pause audio'
                    : 'Play audio'
                  : 'Audio unavailable'}
              </button>
              <button
                type="button"
                onClick={handleRestartTrack}
                className="inline-flex items-center justify-center rounded-full border border-slate-200/40 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg shadow-slate-900/40 transition hover:bg-white/20"
              >
                Restart track
              </button>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-800/60">
              <div
                className="absolute inset-y-0 left-0 bg-cyan-400/80 transition-all"
                style={{ width: `${Math.round(clamp01(audioProgress.progress) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 sm:text-sm">
              <span className="font-mono text-slate-300">{formatTime(audioProgress.time)}</span>
              <span>{playbackStatus}</span>
              <span className="font-mono text-slate-300">{formatTime(audioProgress.duration)}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {uploadedTracks.map((track) => {
              const isSelected = track.id === selectedTrackId
              return (
                <button
                  key={`uploaded-${track.id}`}
                  type="button"
                  onClick={() => handleSelectTrack(track.id)}
                  className={
                    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ' +
                    (isSelected
                      ? 'bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60'
                      : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/70')
                  }
                >
                  <span className="font-medium">{track.title}</span>
                  <span className="text-xs text-emerald-200/80">Локальный</span>
                  <span className="text-xs text-slate-400">{formatTime(track.duration)}</span>
                </button>
              )
            })}
            {TRACK_MANIFEST.map((track) => {
              const isSelected = track.id === selectedTrackId
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleSelectTrack(track.id)}
                  className={
                    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ' +
                    (isSelected
                      ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/50'
                      : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/70')
                  }
                >
                  <span className="font-medium">{track.title}</span>
                  <span className="text-xs text-slate-400">{formatTime(track.duration)}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <TrackUpload
              onFileAccepted={handleUploadFile}
              disabled={!audioSupported}
              processing={isProcessingUpload}
              error={uploadError}
              onClearError={() => setUploadError(null)}
            />
            {recentTracks.length > 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm shadow-lg shadow-slate-900/30">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Последние треки</p>
                  <span className="text-[0.65rem] text-slate-500">Сессия хранит до {MAX_RECENT_TRACKS} записей</span>
                </div>
                <div className="mt-3 space-y-2">
                  {recentTracks.map((entry) => {
                    const available = audioRef.current?.hasCustomTrack(entry.id) ?? false
                    return (
                      <button
                        key={`recent-${entry.id}`}
                        type="button"
                        onClick={() => handleSelectRecentTrack(entry)}
                        className="flex w-full items-center justify-between rounded-xl border border-slate-200/20 bg-slate-800/60 px-3 py-2 text-left transition hover:bg-slate-700/60"
                      >
                        <span className="flex flex-col text-xs">
                          <span className="font-semibold text-slate-200">{entry.title}</span>
                          <span className="text-slate-400">{formatTime(entry.duration)} · ~{Math.round(entry.bpm)} BPM</span>
                        </span>
                        <span
                          className={
                            'text-[0.65rem] font-medium ' +
                            (available ? 'text-emerald-300' : 'text-amber-300')
                          }
                        >
                          {available ? 'Доступно' : 'Нет в памяти'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <header className="flex flex-col gap-3 text-pretty text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-cyan-300/80">
            the path · reactive beat runner
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Calibrate the route through rhythm-synced obstacles
          </h1>
          <p className="text-base text-slate-300 sm:text-lg">
            Deterministic seeds drive the procedural stage. Time steps run on a fixed delta while input events feed a
            coyote-time enabled jump system. Restart to replay the same beatmap or roll a new seed.
          </p>
        </header>

        <section className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl ring-1 ring-white/10">
          <canvas
            ref={canvasRef}
            className="h-[380px] w-full cursor-crosshair bg-transparent sm:h-[460px]"
            role="presentation"
          />

          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="pointer-events-auto space-y-1 rounded-2xl bg-slate-900/60 px-4 py-3 shadow-lg ring-1 ring-white/10">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Seed</p>
                <p className="font-mono text-lg font-semibold text-cyan-100">{hud.seed}</p>
                <div className="grid grid-cols-3 gap-3 pt-2 text-sm text-slate-300 sm:text-base">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/60">Score</p>
                    <p className="font-mono text-2xl font-semibold text-slate-50 tabular-nums">
                      {padScore(Math.floor(hud.score))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/60">Combo</p>
                    <p className="font-mono text-2xl font-semibold text-slate-50">x{hud.combo}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/60">Best</p>
                    <p className="font-mono text-2xl font-semibold text-slate-50">x{hud.bestCombo}</p>
                  </div>
                </div>
              </div>

              <div className="pointer-events-auto w-full max-w-xs space-y-3 rounded-2xl bg-slate-900/60 px-4 py-3 shadow-lg ring-1 ring-white/10 sm:w-64">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Recorder</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleToggleRecording}
                    disabled={!recordingSupported}
                    className={
                      'inline-flex flex-1 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ' +
                      (recordingState === 'recording'
                        ? 'border border-rose-400/60 bg-rose-500/20 text-rose-100 shadow-lg shadow-rose-500/20 hover:bg-rose-500/30'
                        : 'border border-cyan-400/60 bg-cyan-400/15 text-cyan-100 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400/25')
                    }
                  >
                    {recordButtonLabel}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveClip}
                    disabled={saveDisabled}
                    className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-200/40 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg shadow-slate-900/40 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingClip ? 'Saving…' : 'Save clip'}
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800/60">
                    <div
                      className="absolute inset-y-0 left-0 bg-cyan-400/80 transition-all"
                      style={{ width: `${Math.round(bufferRatio * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[0.7rem] text-slate-400">
                    <span>{bufferedLabel}s buffered</span>
                    <span>{bufferLimitLabel}s max</span>
                  </div>
                </div>
                <div className="space-y-1 text-[0.7rem]">
                  <p className="text-slate-400">{recordingStatus}</p>
                  {recordingError ? <p className="text-rose-300">{recordingError}</p> : null}
                </div>
              </div>

              <div className="pointer-events-auto flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="inline-flex items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400/20"
                >
                  Restart run
                </button>
                <button
                  type="button"
                  onClick={handleNewSeed}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200/30 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg shadow-slate-900/40 transition hover:bg-white/20"
                >
                  New seed
                </button>
              </div>
            </div>

            <div className="pointer-events-auto flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900/50 px-4 py-3 text-xs text-slate-300 ring-1 ring-white/10 sm:text-sm">
              <p>
                {hud.status === 'gameover'
                  ? 'Signal lost · tap or press Space/R to restart'
                  : !audioSupported
                    ? 'Web audio unavailable · generator runs on default tempo'
                    : audioState === 'loading'
                      ? 'Analyzing track · hold tight for beat data'
                      : audioState === 'playing'
                        ? 'Stay in rhythm · jump with Space, click or tap'
                        : 'Audio paused · resume playback to sync obstacles'}
              </p>
              <p className="font-mono text-[0.8rem] text-slate-400 sm:text-xs">
                Fixed timestep · deterministic PRNG · Beat generator BPM {selectedTrack?.bpm ?? 108}
              </p>
            </div>
          </div>
        </section>

        <footer className="grid gap-6 text-sm text-slate-400 sm:grid-cols-3">
          <div>
            <p className="font-medium text-slate-200">Deterministic seeds</p>
            <p className="text-pretty">
              Mulberry32 PRNG keeps obstacle patterns reproducible for each seed, enabling confident iteration on
              narrative beats.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-200">Fixed-step physics</p>
            <p className="text-pretty">
              The engine steps the world on a locked delta, combining coyote time, jump buffering, and AABB collisions
              for responsive movement.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-200">Canvas-first rendering</p>
            <p className="text-pretty">
              Layered gradients, beat flashes, and HUD overlays highlight the player&apos;s momentum without sacrificing
              clarity.
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default App
