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

import BottomSheet from './ui/BottomSheet'
import TrackUpload from './ui/TrackUpload'
import { LeadersBoard } from './ui/LeadersBoard'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import useMediaQuery from './hooks/useMediaQuery'
import { validateAudioDuration } from './audio/uploadValidation'
import {
  type StoredRecentTrack,
  MAX_RECENT_TRACKS,
  readRecentTracks,
  toManifest,
  upsertRecentTrack,
  writeRecentTracks,
} from './audio/recentTracks'
import { padScore } from './ui/scoreFormatting'

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

const classNames = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ')

interface StatusMarqueeProps {
  message: string
  prefersReducedMotion: boolean
  className?: string
  innerClassName?: string
}

const StatusMarquee = ({
  message,
  prefersReducedMotion,
  className,
  innerClassName,
}: StatusMarqueeProps) => (
  <div className={classNames('relative overflow-hidden', className)}>
    <div
      className={classNames('flex min-w-full flex-nowrap gap-8 whitespace-nowrap', innerClassName)}
      data-testid="status-marquee-content"
      style={
        prefersReducedMotion
          ? { animation: 'none', transform: 'translateX(0)' }
          : { animation: 'status-marquee 20s linear infinite' }
      }
    >
      <span className="flex-shrink-0">{message}</span>
      <span className="flex-shrink-0" aria-hidden="true">
        {message}
      </span>
    </div>
  </div>
)

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const metricsRef = useRef<ViewportMetrics | null>(null)
  const worldRef = useRef<World | null>(null)
  const seedRef = useRef<string>(createSeed())
  const audioRef = useRef<WebAudioAnalysis | null>(null)
  const recorderRef = useRef<CanvasRecorder | null>(null)

  const prefersReducedMotion = usePrefersReducedMotion()

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
    sessionBestScore: 0,
    personalBestScore: 0,
  }))

  const isSmallViewport = useMediaQuery('(min-width: 640px)')
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [isSheetOpen, setSheetOpen] = useState(false)

  const canvasAspectStyle = useMemo(
    () => ({ aspectRatio: isSmallViewport ? '18 / 9' : '16 / 9' }),
    [isSmallViewport]
  )

  useEffect(() => {
    if (isDesktop) {
      setSheetOpen(false)
    }
  }, [isDesktop])

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
        previous.seed === snapshot.seed &&
        previous.sessionBestScore === snapshot.sessionBestScore &&
        previous.personalBestScore === snapshot.personalBestScore
      ) {
        return previous
      }
      return snapshot
    })
  }, [])

  const resetAudioTimeline = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audio.isSupported()) return
    const state = audio.getState()
    if (state === 'idle' || state === 'loading') {
      audio.setCurrentTime(0)
      return
    }
    const shouldResume = state === 'playing'
    audio.stop()
    if (shouldResume) {
      audio.play().catch((error) => {
        console.error(error)
      })
    }
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
        if (world.consumePendingReset()) {
          resetAudioTimeline()
        }
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
      renderer.dispose()
      input.unbind()
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateMetrics)
      if (detachAudioEvents) detachAudioEvents()
      setWorldReady(false)
      if (worldRef.current === world) worldRef.current = null
    }
  }, [pushHud, resetAudioTimeline])

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
    resetAudioTimeline()
    world.reset()
    pushHud(world)
  }, [pushHud, resetAudioTimeline])

  const handleNewSeed = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    resetAudioTimeline()
    const nextSeed = createSeed()
    seedRef.current = nextSeed
    world.reset(nextSeed)
    pushHud(world)
  }, [pushHud, resetAudioTimeline])

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

  const statusMessage =
    hud.status === 'gameover'
      ? 'Signal lost · tap or press Space/R to restart'
      : !audioSupported
        ? 'Web audio unavailable · generator runs on default tempo'
        : audioState === 'loading'
          ? 'Analyzing track · hold tight for beat data'
          : audioState === 'playing'
            ? 'Stay in rhythm · jump with Space, click or tap'
            : 'Audio paused · resume playback to sync obstacles'

  const telemetryItems = [
    {
      key: 'score',
      label: 'Score',
      value: padScore(hud.score),
      description: 'Current run total',
    },
    {
      key: 'combo',
      label: 'Combo',
      value: `x${hud.combo}`,
      description: 'Active streak',
    },
    {
      key: 'best',
      label: 'Best',
      value: `x${hud.bestCombo}`,
      description: 'Session record',
    },
    {
      key: 'seed',
      label: 'Seed',
      value: hud.seed,
      description: 'Procedural key',
    },
    {
      key: 'session-best-score',
      label: 'Session best',
      value: padScore(hud.sessionBestScore),
      description: 'Highest score this session',
    },
    {
      key: 'personal-best-score',
      label: 'Personal best',
      value: padScore(hud.personalBestScore),
      description: 'Stored local record',
    },
  ] as const

  const renderTrackSummary = () => (
    <div className="space-y-5">
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
      <div className="space-y-3">
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-800/60">
          <div
            data-testid="audio-progress-fill"
            className="absolute inset-y-0 left-0 bg-cyan-400/80 transition-all"
            style={{
              width: `${Math.round(clamp01(audioProgress.progress) * 100)}%`,
              transition: prefersReducedMotion ? 'none' : undefined,
            }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400 sm:text-sm">
          <span className="font-mono text-slate-300">{formatTime(audioProgress.time)}</span>
          <span>{playbackStatus}</span>
          <span className="font-mono text-slate-300">{formatTime(audioProgress.duration)}</span>
        </div>
      </div>
    </div>
  )

  const renderTrackChips = () => (
    <div className="flex flex-wrap gap-2">
      {uploadedTracks.map((track) => {
        const isSelected = track.id === selectedTrackId
        return (
          <button
            key={`uploaded-${track.id}`}
            type="button"
            onClick={() => handleSelectTrack(track.id)}
            className={classNames(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition',
              isSelected
                ? 'bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/70',
            )}
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
            className={classNames(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition',
              isSelected
                ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/50'
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/70',
            )}
          >
            <span className="font-medium">{track.title}</span>
            <span className="text-xs text-slate-400">{formatTime(track.duration)}</span>
          </button>
        )
      })}
    </div>
  )

  const renderTrackUploadSection = () => (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                    className={classNames(
                      'text-[0.65rem] font-medium',
                      available ? 'text-emerald-300' : 'text-amber-300',
                    )}
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
  )

  const renderTrackControls = (includeSummary: boolean) => (
    <div className="space-y-6">
      {includeSummary ? renderTrackSummary() : null}
      {renderTrackChips()}
      {renderTrackUploadSection()}
    </div>
  )

  const renderScoreboardCard = (className?: string) => (
    <div
      className={classNames(
        'w-full space-y-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 shadow-lg ring-1 ring-white/10',
        className,
      )}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Seed</p>
      <p className="font-mono text-lg font-semibold text-cyan-100">{hud.seed}</p>
      <div className="grid grid-cols-3 gap-3 pt-2 text-sm text-slate-300 sm:text-base">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/60">Score</p>
          <p className="font-mono text-2xl font-semibold text-slate-50 tabular-nums">{padScore(hud.score)}</p>
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
  )

  const renderLeadersCard = (className?: string) => (
    <LeadersBoard
      sessionBest={hud.sessionBestScore}
      personalBest={hud.personalBestScore}
      className={className}
    />
  )

  const renderRecorderCard = (className?: string) => (
    <div
      className={classNames(
        'w-full space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 shadow-lg ring-1 ring-white/10',
        className,
      )}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Recorder</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleToggleRecording}
          disabled={!recordingSupported}
          className={classNames(
            'inline-flex flex-1 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
            recordingState === 'recording'
              ? 'border border-rose-400/60 bg-rose-500/20 text-rose-100 shadow-lg shadow-rose-500/20 hover:bg-rose-500/30'
              : 'border border-cyan-400/60 bg-cyan-400/15 text-cyan-100 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400/25',
          )}
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
            data-testid="recorder-progress-fill"
            className="absolute inset-y-0 left-0 bg-cyan-400/80 transition-all"
            style={{
              width: `${Math.round(bufferRatio * 100)}%`,
              transition: prefersReducedMotion ? 'none' : undefined,
            }}
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
  )

  const renderRunActions = (className?: string) => (
    <div className={classNames('flex flex-col gap-2 sm:flex-row', className)}>
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
  )

  const heroHeader = (
    <header className="flex flex-col gap-3 text-pretty text-center md:text-left">
      <p className="text-xs font-semibold uppercase tracking-[0.4em] text-cyan-300/80">the path · reactive beat runner</p>
      <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        Calibrate the route through rhythm-synced obstacles
      </h1>
      <p className="text-base text-slate-300 sm:text-lg">
        Deterministic seeds drive the procedural stage. Time steps run on a fixed delta while input events feed a coyote-time
        enabled jump system. Restart to replay the same beatmap or roll a new seed.
      </p>
    </header>
  )

  const canvasSection = (

    <section
      className={classNames(
        'relative w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl ring-1 ring-white/10',
        'aspect-hero-video sm:aspect-hero-video-wide'
      )}
    >
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair bg-transparent"
        role="presentation"
        style={canvasAspectStyle}

    <section className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl ring-1 ring-white/10">
      <canvas
        ref={canvasRef}
        className="h-[380px] w-full cursor-crosshair bg-transparent sm:h-[460px]"
        style={{ touchAction: 'none' }}
        aria-label="Gameplay canvas. Use touch gestures to guide the runner."

      />
      <div className="pointer-events-none absolute inset-0 hidden flex-col justify-between p-5 md:flex">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {renderScoreboardCard('pointer-events-auto w-full max-w-sm lg:max-w-md')}
          {renderLeadersCard('pointer-events-auto w-full max-w-xs sm:w-64')}
          {renderRecorderCard('pointer-events-auto w-full max-w-xs sm:w-64')}
          {renderRunActions('pointer-events-auto')}
        </div>
        <div className="pointer-events-auto flex w-full flex-wrap items-center gap-3 rounded-2xl bg-slate-900/50 px-4 py-3 text-xs text-slate-300 ring-1 ring-white/10 sm:justify-between sm:text-sm">
          <StatusMarquee
            message={statusMessage}
            prefersReducedMotion={prefersReducedMotion}
            className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-left text-xs text-slate-200 sm:flex-1"
            innerClassName="gap-12"
          />
          <p className="font-mono text-[0.8rem] text-slate-400 sm:text-xs">
            Fixed timestep · deterministic PRNG · Beat generator BPM {selectedTrack?.bpm ?? 108}
          </p>
        </div>
      </div>
    </section>
  )

  const footerContent = (
    <footer className="grid gap-6 text-sm text-slate-400 sm:grid-cols-3">
      <div>
        <p className="font-medium text-slate-200">Deterministic seeds</p>
        <p className="text-pretty">
          Mulberry32 PRNG keeps obstacle patterns reproducible for each seed, enabling confident iteration on narrative beats.
        </p>
      </div>
      <div>
        <p className="font-medium text-slate-200">Fixed-step physics</p>
        <p className="text-pretty">
          The engine steps the world on a locked delta, combining coyote time, jump buffering, and AABB collisions for responsive
          movement.
        </p>
      </div>
      <div>
        <p className="font-medium text-slate-200">Canvas-first rendering</p>
        <p className="text-pretty">
          Layered gradients, beat flashes, and HUD overlays highlight the player&apos;s momentum without sacrificing clarity.
        </p>
      </div>
    </footer>
  )

  const telemetryChips = (
    <div className="telemetry-scroll flex gap-3 overflow-x-auto pb-2 text-sm sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible md:grid-cols-3">
      {telemetryItems.map((item) => (
        <div
          key={item.key}
          className="min-w-[160px] rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 shadow-lg sm:min-w-0"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">{item.label}</p>
          <p className="font-mono text-lg font-semibold text-slate-50">{item.value}</p>
          <p className="text-xs text-slate-400">{item.description}</p>
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12">
        {isDesktop ? (
          <div className="grid gap-10 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
            <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-xl ring-1 ring-white/10">
              {renderTrackControls(true)}
            </section>
            <div className="flex flex-col gap-10">
              {heroHeader}
              {canvasSection}
              {footerContent}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {canvasSection}
            <div className="space-y-6">
              {heroHeader}
              <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-xl ring-1 ring-white/10">
                {renderTrackSummary()}
              </section>
              <StatusMarquee
                message={statusMessage}
                prefersReducedMotion={prefersReducedMotion}
                className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs text-cyan-100 shadow-inner"
              />
              {telemetryChips}
            </div>
            {footerContent}
          </div>
        )}
      </main>
      {!isDesktop ? (
        <>
          <button
            type="button"
            aria-label="Open controls"
            aria-expanded={isSheetOpen}
            aria-controls="mobile-controls"
            onClick={() => setSheetOpen(true)}
            className={classNames(
              'fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-2xl transition md:hidden focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-950',
              isSheetOpen && 'translate-y-12 opacity-0 pointer-events-none',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h16" />
              <path d="M4 12h12" />
              <path d="M4 17h8" />
              <circle cx="16" cy="7" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="20" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            <span className="sr-only">Open controls</span>
          </button>
          <BottomSheet
            open={isSheetOpen}
            onOpenChange={setSheetOpen}
            prefersReducedMotion={prefersReducedMotion}
            title="Control surface"
            id="mobile-controls"
          >
            <div className="space-y-6">
              {renderScoreboardCard()}
              {renderLeadersCard()}
              {renderRecorderCard()}
              {renderRunActions()}
              <StatusMarquee
                message={statusMessage}
                prefersReducedMotion={prefersReducedMotion}
                className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-xs text-slate-200"
                innerClassName="gap-12"
              />
              <p className="text-xs text-slate-400">
                Fixed timestep · deterministic PRNG · Beat generator BPM {selectedTrack?.bpm ?? 108}
              </p>
              {renderTrackControls(false)}
            </div>
          </BottomSheet>
        </>
      ) : null}
    </div>
  )
}

export default App
