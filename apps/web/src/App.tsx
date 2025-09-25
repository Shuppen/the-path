import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'

import {
  DEFAULT_TRACK_ID,
  TRACK_MANIFEST,
  getTrackById,
  type AudioTrackManifestEntry,
} from './assets/tracks'
import { WebAudioAnalysis } from './audio/WebAudioAnalysis'
import {
  MAX_RECENT_TRACKS,
  readRecentTracks,
  toManifest,
  upsertRecentTrack,
  writeRecentTracks,
  type StoredRecentTrack,
} from './audio/recentTracks'
import { formatValidationErrorMessage, validateAudioDuration } from './audio/uploadValidation'
import { createSeed } from './core/prng'
import { getPrefersReducedMotion, setReducedMotionOverride } from './environment/reducedMotion'
import type { WorldSnapshot } from './world'

import HomeScreen from './screens/Home'
import SongSelectScreen from './screens/SongSelect'
import GameScreen from './screens/Game'
import ResultsScreen from './screens/Results'
import SettingsScreen from './screens/Settings'

type Screen = 'home' | 'song-select' | 'game' | 'results' | 'settings'

interface GameResult {
  track: AudioTrackManifestEntry
  snapshot: WorldSnapshot
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

const formatTime = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0:00'
  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const describeUploadedTrack = (duration: number, bpm: number): string => {
  const roundedBpm = Math.round(bpm)
  return `User uploaded · ${formatTime(duration)} · ~${roundedBpm} BPM`
}

interface StatusMarqueeProps {
  message: string
  prefersReducedMotion: boolean
}

export function StatusMarquee({ message, prefersReducedMotion }: StatusMarqueeProps) {
  const contentRef = useRef<HTMLSpanElement | null>(null)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    const element = contentRef.current
    if (!element) {
      return
    }

    const evaluate = () => {
      if (!contentRef.current) return
      if (prefersReducedMotion) {
        setShouldAnimate(false)
        return
      }
      const { clientWidth, scrollWidth } = contentRef.current
      setShouldAnimate(scrollWidth - clientWidth > 1)
    }

    evaluate()

    const observer = new ResizeObserver(() => {
      evaluate()
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [prefersReducedMotion, message])

  const animationStyle = prefersReducedMotion || !shouldAnimate ? 'none' : 'status-marquee 20s linear infinite'

  return (
    <div className="relative overflow-hidden whitespace-nowrap">
      <span
        ref={contentRef}
        data-testid="status-marquee-content"
        className="inline-flex items-center gap-6 text-sm text-slate-300"
        style={{ animation: animationStyle }}
      >
        {message}
        {!prefersReducedMotion && shouldAnimate ? <span aria-hidden="true">{message}</span> : null}
      </span>
    </div>
  )
}

const resolveAudio = (ref: MutableRefObject<WebAudioAnalysis | null>): WebAudioAnalysis => {
  if (!ref.current) {
    ref.current = new WebAudioAnalysis()
  }
  return ref.current
}

export function App() {
  const audioRef = useRef<WebAudioAnalysis | null>(null)
  const audio = resolveAudio(audioRef)

  const audioSupported = audio.isSupported()

  const [screen, setScreen] = useState<Screen>(() => {
    if (typeof window === 'undefined') {
      return 'home'
    }
    const params = new URLSearchParams(window.location.search)
    const requested = params.get('screen')
    if (requested === 'game' || requested === 'song-select' || requested === 'results' || requested === 'settings') {
      return requested
    }
    if (params.has('autostart')) {
      return 'game'
    }
    return 'home'
  })
  const [selectedTrackId, setSelectedTrackId] = useState<string>(DEFAULT_TRACK_ID)
  const [uploadedTracks, setUploadedTracks] = useState<AudioTrackManifestEntry[]>([])
  const [recentTracks, setRecentTracks] = useState<StoredRecentTrack[]>(() => readRecentTracks())
  const [gameResult, setGameResult] = useState<GameResult | null>(null)
  const [lastTrackId, setLastTrackId] = useState<string | null>(null)
  const [isProcessingUpload, setIsProcessingUpload] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dprCap, setDprCap] = useState(1.5)
  const [reducedMotionEnabled, setReducedMotionEnabled] = useState<boolean>(() => getPrefersReducedMotion())

  useEffect(() => {
    writeRecentTracks(recentTracks)
  }, [recentTracks])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const requested = params.get('screen')
    if (requested === 'game' || requested === 'song-select' || requested === 'results' || requested === 'settings') {
      setScreen(requested)
    } else if (params.has('autostart')) {
      setScreen('game')
    }
  }, [])

  useEffect(() => {
    setReducedMotionOverride(reducedMotionEnabled)
  }, [reducedMotionEnabled])

  const resolveTrackById = useCallback(
    (id: string): AudioTrackManifestEntry | undefined =>
      uploadedTracks.find((track) => track.id === id) ?? getTrackById(id) ?? uploadedTracks[0] ?? TRACK_MANIFEST[0],
    [uploadedTracks],
  )

  const selectedTrack = useMemo(() => resolveTrackById(selectedTrackId), [resolveTrackById, selectedTrackId])

  useEffect(() => {
    if (!selectedTrack) {
      const fallback = uploadedTracks[0] ?? TRACK_MANIFEST[0]
      if (fallback) {
        setSelectedTrackId(fallback.id)
      }
    }
  }, [selectedTrack, uploadedTracks])


  const handleStartGame = useCallback(() => {
    if (!selectedTrack) return
    setGameResult(null)
    setScreen('game')
  }, [selectedTrack])

  const handleShowResults = useCallback(
    (snapshot: WorldSnapshot) => {
      if (!selectedTrack) return
      setSelectedTrackId(selectedTrack.id)
      setGameResult({ track: selectedTrack, snapshot })
      setLastTrackId(selectedTrack.id)
      setScreen('results')
    },
    [selectedTrack],
  )

  const handleExitGame = useCallback(
    (snapshot: WorldSnapshot | null) => {
      if (selectedTrack) {
        setLastTrackId(selectedTrack.id)
      }
      if (snapshot && selectedTrack) {
        setSelectedTrackId(selectedTrack.id)
        setGameResult({ track: selectedTrack, snapshot })
        setScreen('results')
        return
      }
      setScreen('home')
    },
    [selectedTrack],
  )

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!audioSupported) {
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
          setUploadError(formatValidationErrorMessage(durationError, file.name))
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
          const retained = previous.filter((track) => track.id !== manifest.id && audio.hasCustomTrack(track.id))
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
    [audio, audioSupported],
  )

  const handleSelectRecentTrack = useCallback(
    (entry: StoredRecentTrack) => {
      if (!audioSupported) {
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
        const manifest = { ...toManifest(entry), description: describeUploadedTrack(entry.duration, entry.bpm) }
        const retained = previous.filter((track) => audio.hasCustomTrack(track.id))
        return [manifest, ...retained].slice(0, MAX_RECENT_TRACKS)
      })

      setUploadError(null)
      setSelectedTrackId(entry.id)
    },
    [audio, audioSupported],
  )

  const handleChangeDpr = useCallback((value: number) => {
    setDprCap(value)
  }, [])

  const handleToggleReducedMotion = useCallback((value: boolean) => {
    setReducedMotionEnabled(value)
  }, [])

  const lastTrack = useMemo(() => (lastTrackId ? resolveTrackById(lastTrackId) ?? null : null), [lastTrackId, resolveTrackById])

  return (
    <div className="min-h-screen bg-[#0B0F14] text-slate-100">
      {screen === 'home' ? (
        <HomeScreen
          onStart={handleStartGame}
          onOpenSongSelect={() => setScreen('song-select')}
          onOpenSettings={() => setScreen('settings')}
          lastTrack={lastTrack}
        />
      ) : null}

      {screen === 'song-select' ? (
        <SongSelectScreen
          builtInTracks={TRACK_MANIFEST}
          uploadedTracks={uploadedTracks}
          selectedTrackId={selectedTrackId}
          onSelectTrack={setSelectedTrackId}
          onBack={() => setScreen('home')}
          onStart={handleStartGame}
          onUpload={handleUploadFile}
          uploadError={uploadError}
          onClearUploadError={() => setUploadError(null)}
          isProcessingUpload={isProcessingUpload}
          audioSupported={audioSupported}
          recentTracks={recentTracks}
          onSelectRecentTrack={handleSelectRecentTrack}
        />
      ) : null}

      {screen === 'settings' ? (
        <SettingsScreen
          dprCap={dprCap}
          onChangeDpr={handleChangeDpr}
          reducedMotion={reducedMotionEnabled}
          onChangeReducedMotion={handleToggleReducedMotion}
          onBack={() => setScreen('home')}
        />
      ) : null}

      {screen === 'game' && selectedTrack ? (
        <GameScreen track={selectedTrack} audio={audio} dprCap={dprCap} onComplete={handleShowResults} onExit={handleExitGame} />
      ) : null}

      {screen === 'results' && gameResult ? (
        <ResultsScreen
          track={gameResult.track}
          snapshot={gameResult.snapshot}
          onRetry={handleStartGame}
          onHome={() => setScreen('home')}
          onSongSelect={() => setScreen('song-select')}
        />
      ) : null}
    </div>
  )
}

export default App
