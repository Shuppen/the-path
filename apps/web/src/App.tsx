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
import { readAudioSettings, sanitizeAudioSettings, type AudioSettings, writeAudioSettings } from './audio/preferences'
import { getPrefersReducedMotion, setReducedMotionOverride } from './environment/reducedMotion'
import {
  type ActiveUpgrade,
  type CalibrationSettings,
  type MetaProgressState,
  type WorldMode,
  type WorldSnapshot,
  type UpgradeCard,
} from './world'
import { readCalibrationSettings, readMetaProgress, writeCalibrationSettings, writeMetaProgress } from './world/storage'

import HomeScreen from './screens/Home'
import SongSelectScreen from './screens/SongSelect'
import GameScreen from './screens/Game'
import ResultsScreen from './screens/Results'
import SettingsScreen from './screens/Settings'
import StoreScreen from './screens/Store'
import BattlePassScreen from './screens/BattlePass'
import EventsScreen from './screens/Events'
import ShareScreen from './screens/Share'
import ReplayClipExporter from './share/ReplayClipExporter'
import { createAnalytics } from './services/analytics'
import {
  getRemoteConfig,
  loadRemoteConfig,
  type RemoteConfig,
  type RewardedAdPlacement,
} from './services/remoteConfig'
import { createRewardedAdService } from './services/ads'
import {
  getBattlePassRewards,
  claimBattlePassReward,
  unlockPremiumBattlePass,
  syncBattlePassWithConfig,
} from './liveops/battlePass'
import {
  getChallengeState,
  recordChallengeProgress,
  markChallengeClaimed,
  type ChallengeState,
} from './liveops/challenges'

type Screen =
  | 'home'
  | 'song-select'
  | 'game'
  | 'results'
  | 'settings'
  | 'store'
  | 'battle-pass'
  | 'events'
  | 'share'

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

const PREMIUM_UNLOCK_COST = 1200

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
  const [calibration, setCalibration] = useState<CalibrationSettings>(() => readCalibrationSettings())
  const [activeUpgrades, setActiveUpgrades] = useState<ActiveUpgrade[]>([])
  const [worldMode, setWorldMode] = useState<WorldMode>('track')
  const [metaProgress, setMetaProgress] = useState<MetaProgressState>(() => readMetaProgress())
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => readAudioSettings())
  const analytics = useRef(createAnalytics()).current
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig>(() => getRemoteConfig())
  const adServiceRef = useRef(createRewardedAdService())
  const adService = adServiceRef.current
  const [dailyChallenge, setDailyChallenge] = useState<ChallengeState>(() => getChallengeState('daily', remoteConfig))
  const [weeklyChallenge, setWeeklyChallenge] = useState<ChallengeState>(() => getChallengeState('weekly', remoteConfig))
  const [shareExporter, setShareExporter] = useState<ReplayClipExporter | null>(null)
  const [shareHistory, setShareHistory] = useState<Array<{ presetId: string; url: string; createdAt: number }>>([])
  const [shareStatusMessage, setShareStatusMessage] = useState<string | null>(null)
  const [adStatus, setAdStatus] = useState<string | null>(null)
  const [storeMessage, setStoreMessage] = useState<string | null>(null)
  const [battlePassMessage, setBattlePassMessage] = useState<string | null>(null)
  const [eventsMessage, setEventsMessage] = useState<string | null>(null)
  const [sessionUnlocks, setSessionUnlocks] = useState<string[]>([])

  useEffect(() => {
    writeRecentTracks(recentTracks)
  }, [recentTracks])

  useEffect(() => {
    if (!audioSupported) return
    const settings = audioSettings
    audio.setMusicVolume(settings.music)
    audio.setSfxVolume(settings.sfx)
    audio.setVoiceVolume(settings.voice)
    if (settings.eqPreset === 'custom' && settings.customEq) {
      audio.setCustomEq(settings.customEq)
    } else {
      audio.setEqPreset(settings.eqPreset)
    }
    writeAudioSettings(settings)
  }, [audio, audioSettings, audioSupported])

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

  useEffect(() => {
    writeCalibrationSettings(calibration)
  }, [calibration])

  useEffect(() => {
    writeMetaProgress(metaProgress)
  }, [metaProgress])

  useEffect(() => {
    if (typeof process !== 'undefined' && process.env?.VITEST) {
      return undefined
    }

    let active = true
    loadRemoteConfig()
      .then((config) => {
        if (!active) return
        setRemoteConfig((previous) => (previous === config ? previous : config))
      })
      .catch((error) => {
        console.warn('Failed to load remote config:', error)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    analytics.startSession()
    return () => {
      analytics.endSession()
    }
  }, [analytics])

  const shareHistoryRef = useRef(shareHistory)
  useEffect(() => {
    shareHistoryRef.current = shareHistory
  }, [shareHistory])

  useEffect(() => {
    return () => {
      shareHistoryRef.current.forEach((entry) => {
        if (entry.url && typeof URL !== 'undefined') {
          URL.revokeObjectURL(entry.url)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (screen !== 'store') setStoreMessage(null)
    if (screen !== 'battle-pass') setBattlePassMessage(null)
    if (screen !== 'events') setEventsMessage(null)
    if (screen !== 'share') setShareStatusMessage(null)
    if (screen !== 'results') setAdStatus(null)
  }, [screen])

  const resolveTrackById = useCallback(
    (id: string): AudioTrackManifestEntry | undefined =>
      uploadedTracks.find((track) => track.id === id) ?? getTrackById(id) ?? uploadedTracks[0] ?? TRACK_MANIFEST[0],
    [uploadedTracks],
  )

  const selectedTrack = useMemo(() => resolveTrackById(selectedTrackId), [resolveTrackById, selectedTrackId])
  const eqPresets = useMemo(() => audio.listEqPresets(), [audio])
  const shareLink = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin
    }
    return 'https://play-the-path.web'
  }, [])

  const updateMetaProgress = useCallback(
    (updater: MetaProgressState | ((prev: MetaProgressState) => MetaProgressState)) => {
      setMetaProgress((previous) => {
        const next =
          typeof updater === 'function'
            ? (updater as (value: MetaProgressState) => MetaProgressState)(previous)
            : updater
        return syncBattlePassWithConfig(next, remoteConfig)
      })
    },
    [remoteConfig],
  )

  useEffect(() => {
    updateMetaProgress((previous) => previous)
    setDailyChallenge(getChallengeState('daily', remoteConfig))
    setWeeklyChallenge(getChallengeState('weekly', remoteConfig))
  }, [remoteConfig, updateMetaProgress])

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
    analytics.trackLevelStart(selectedTrack.id, worldMode)
    setGameResult(null)
    setAdStatus(null)
    setScreen('game')
  }, [analytics, selectedTrack, worldMode])

  const handleShowResults = useCallback(
    (snapshot: WorldSnapshot) => {
      if (!selectedTrack) return
      const outcome = snapshot.status === 'gameover' && snapshot.health <= 0 ? 'fail' : snapshot.health > 0 ? 'success' : 'fail'
      analytics.trackLevelEnd(selectedTrack.id, worldMode, outcome, snapshot.score, snapshot.accuracy)
      setSelectedTrackId(selectedTrack.id)
      setGameResult({ track: selectedTrack, snapshot })
      setLastTrackId(selectedTrack.id)
      updateMetaProgress(snapshot.meta)
      setDailyChallenge(recordChallengeProgress('daily', 1, remoteConfig))
      const weeklyDelta = Math.max(1, Math.round(snapshot.score / 10000))
      setWeeklyChallenge(recordChallengeProgress('weekly', weeklyDelta, remoteConfig))
      setScreen('results')
    },
    [analytics, remoteConfig, selectedTrack, updateMetaProgress, worldMode],
  )

  const handleExitGame = useCallback(
    (snapshot: WorldSnapshot | null) => {
      if (selectedTrack) {
        setLastTrackId(selectedTrack.id)
      }
      if (snapshot && selectedTrack) {
        handleShowResults(snapshot)
        return
      }
      setScreen('home')
    },
    [handleShowResults, selectedTrack],
  )

  const handleAudioSettingsChange = useCallback((next: AudioSettings) => {
    setAudioSettings(sanitizeAudioSettings(next))
  }, [])

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!audioSupported) {
        setUploadError('Web Audio API недоступна в этом браузере.')
        return
      }

      setIsProcessingUpload(true)
      setUploadError(null)

      try {
        const { id, duration, bpm, peaks } = await audio.importFromBlob(file)
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
          peaks,
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
          peaks,
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

  const handleStoreCommit = useCallback(
    (
      nextMeta: MetaProgressState,
      payload: { description: string; sku: string; price?: number; currency?: string; kind: 'soft' | 'real' },
    ) => {
      updateMetaProgress(nextMeta)
      setStoreMessage(payload.description)
      analytics.trackPurchase({
        sku: payload.sku,
        price: payload.price ?? 0,
        currency: payload.currency ?? (payload.kind === 'soft' ? 'soft' : 'USD'),
        kind: payload.kind,
        meta: { description: payload.description },
      })
    },
    [analytics, updateMetaProgress],
  )

  const handleStoreError = useCallback((message: string) => {
    setStoreMessage(message)
  }, [])

  const handleRecorderReady = useCallback((exporter: ReplayClipExporter | null) => {
    setShareExporter(exporter)
    if (!exporter) {
      setShareStatusMessage(null)
    }
  }, [])

  const handleShareExport = useCallback(
    async (presetId: string) => {
      if (!shareExporter) {
        setShareStatusMessage('Запись недоступна в этой сессии.')
        return
      }
      try {
        const result = await shareExporter.exportClip(presetId)
        if (!result) {
          setShareStatusMessage('Не удалось получить клип.')
          return
        }
        const url = result.url ?? (typeof URL !== 'undefined' ? URL.createObjectURL(result.blob) : '')
        setShareHistory((previous) => {
          const entry = { presetId: result.preset.id, url, createdAt: Date.now() }
          const combined = [entry, ...previous]
          const limited = combined.slice(0, 5)
          combined.slice(5).forEach((item) => {
            if (item.url && typeof URL !== 'undefined') {
              URL.revokeObjectURL(item.url)
            }
          })
          return limited
        })
        setShareStatusMessage('Клип сохранён — скачайте или поделитесь!')
        analytics.trackShareExport({
          presetId: result.preset.id,
          duration: result.preset.duration,
          format: result.blob.type || 'video/webm',
        })
      } catch (error) {
        console.warn('Share export failed', error)
        setShareStatusMessage('Ошибка экспорта клипа. Попробуйте снова.')
      }
    },
    [analytics, shareExporter],
  )

  const handleCopyShareLink = useCallback(async () => {
    const target = `${shareLink}?ref=share`
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(target)
        setShareStatusMessage('Ссылка скопирована в буфер обмена.')
      } else {
        setShareStatusMessage(`Скопируйте вручную: ${target}`)
      }
    } catch (error) {
      console.warn('Copy link failed', error)
      setShareStatusMessage(`Скопируйте вручную: ${target}`)
    }
  }, [shareLink])

  const handleCopySeasonLink = useCallback(async () => {
    const target = `${shareLink}?season=${encodeURIComponent(metaProgress.battlePass.seasonId)}`
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(target)
        setBattlePassMessage('Ссылка на сезон скопирована!')
      } else {
        setBattlePassMessage(`Скопируйте вручную: ${target}`)
      }
    } catch (error) {
      console.warn('Copy season link failed', error)
      setBattlePassMessage(`Скопируйте вручную: ${target}`)
    }
  }, [metaProgress.battlePass.seasonId, shareLink])

  const handleUnlockPremium = useCallback(() => {
    updateMetaProgress((previous) => {
      if (previous.battlePass.premiumUnlocked) {
        setBattlePassMessage('Премиум уже активирован.')
        return previous
      }
      if (previous.coins < PREMIUM_UNLOCK_COST) {
        setBattlePassMessage(`Нужно ${PREMIUM_UNLOCK_COST} ◈ для премиума.`)
        return previous
      }
      const nextMeta = unlockPremiumBattlePass({
        ...previous,
        coins: previous.coins - PREMIUM_UNLOCK_COST,
      })
      setBattlePassMessage('Премиум дорожка активирована!')
      analytics.trackPurchase({
        sku: 'battle-pass-premium',
        price: PREMIUM_UNLOCK_COST,
        currency: 'soft',
        kind: 'soft',
        meta: { description: 'Battle Pass premium unlock' },
      })
      return nextMeta
    })
  }, [analytics, updateMetaProgress])

  const handleClaimBattlePass = useCallback(
    (rewardId: string) => {
      updateMetaProgress((previous) => {
        const result = claimBattlePassReward(previous, rewardId)
        if (!result.success) {
          setBattlePassMessage(result.error ?? 'Награда недоступна')
          return previous
        }
        setBattlePassMessage('Награда получена!')
        return result.updatedMeta
      })
    },
    [updateMetaProgress],
  )

  const handleClaimChallenge = useCallback(
    (kind: 'daily' | 'weekly') => {
      const state = kind === 'daily' ? dailyChallenge : weeklyChallenge
      if (state.claimed || state.progress < state.goal) {
        setEventsMessage('Сначала выполните задание целиком.')
        return
      }
      const rewardCoins = kind === 'daily' ? remoteConfig.missions.dailyRewardCoins : remoteConfig.missions.weeklyRewardCoins
      updateMetaProgress((previous) => ({ ...previous, coins: previous.coins + rewardCoins }))
      if (kind === 'daily') {
        setDailyChallenge(markChallengeClaimed('daily', remoteConfig))
      } else {
        setWeeklyChallenge(markChallengeClaimed('weekly', remoteConfig))
      }
      setEventsMessage(`Получено ${rewardCoins} монет.`)
    },
    [dailyChallenge, weeklyChallenge, remoteConfig, updateMetaProgress],
  )

  const handleWatchAd = useCallback(
    async (placement: RewardedAdPlacement) => {
      setAdStatus(null)
      try {
        const result = await adService.show(placement)
        if (result.status !== 'rewarded' || !result.reward) {
          const message = result.message ?? (result.status === 'capped' ? 'Лимит достигнут. Попробуйте позже.' : 'Реклама недоступна')
          setAdStatus(message)
          return
        }
        analytics.trackAdReward({ placement, rewardType: result.reward.type, value: result.reward.amount })
        switch (placement) {
          case 'second_chance': {
            setAdStatus('Вторая жизнь активирована!')
            handleStartGame()
            break
          }
          case 'unlock_track_session': {
            const pool = TRACK_MANIFEST.map((track) => track.id)
            const locked = pool.filter((id) => !metaProgress.unlockedTracks.includes(id))
            const candidates = locked.length > 0 ? locked : pool
            if (!candidates.length) {
              setAdStatus('Нет доступных треков для разблокировки.')
              break
            }
            const chosen = candidates[Math.floor(Math.random() * candidates.length)]
            setSessionUnlocks((previous) => Array.from(new Set([chosen, ...previous])))
            setAdStatus('Новый трек доступен до конца сессии!')
            break
          }
          case 'currency_boost':
          default: {
            updateMetaProgress((previous) => ({ ...previous, coins: previous.coins + result.reward.amount }))
            setAdStatus(`Получено ${result.reward.amount} монет.`)
            break
          }
        }
      } catch (error) {
        console.warn('Rewarded ad failed', error)
        setAdStatus('Не удалось показать ролик. Попробуйте позже.')
      }
    },
    [adService, analytics, handleStartGame, metaProgress.unlockedTracks, updateMetaProgress],
  )

  const handleChangeDpr = useCallback((value: number) => {
    setDprCap(value)
  }, [])

  const handleToggleReducedMotion = useCallback((value: boolean) => {
    setReducedMotionEnabled(value)
  }, [])

  const handleChangeCalibration = useCallback((value: CalibrationSettings) => {
    setCalibration(value)
  }, [])

  const handleSelectUpgrade = useCallback((card: UpgradeCard) => {
    setActiveUpgrades((previous) => {
      const existing = previous.find((upgrade) => upgrade.id === card.id)
      if (existing) {
        return previous.map((upgrade) =>
          upgrade.id === card.id ? { ...upgrade, stacks: upgrade.stacks + 1 } : upgrade,
        )
      }
      const next: ActiveUpgrade = { ...card, stacks: 1 }
      return [...previous, next]
    })
    setGameResult((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        snapshot: {
          ...previous.snapshot,
          upgrades: {
            ...previous.snapshot.upgrades,
            offered: previous.snapshot.upgrades.offered.filter((upgrade) => upgrade.id !== card.id),
          },
        },
      }
    })
  }, [])

  const lastTrack = useMemo(() => (lastTrackId ? resolveTrackById(lastTrackId) ?? null : null), [lastTrackId, resolveTrackById])

  const challengeSummary = useMemo(
    () => ({
      daily: `${Math.min(dailyChallenge.goal, dailyChallenge.progress)}/${dailyChallenge.goal}`,
      weekly: `${Math.min(weeklyChallenge.goal, weeklyChallenge.progress)}/${weeklyChallenge.goal}`,
    }),
    [dailyChallenge, weeklyChallenge],
  )

  const battlePassRewards = useMemo(() => getBattlePassRewards(), [])

  const sharePresets = useMemo(() => shareExporter?.getPresets() ?? [], [shareExporter])

  const adAvailability: Record<RewardedAdPlacement, { remaining: number; cooldown: number }> = {
    second_chance: {
      remaining: adService.getRemainingQuota('second_chance'),
      cooldown: adService.getCooldownMinutes('second_chance'),
    },
    unlock_track_session: {
      remaining: adService.getRemainingQuota('unlock_track_session'),
      cooldown: adService.getCooldownMinutes('unlock_track_session'),
    },
    currency_boost: {
      remaining: adService.getRemainingQuota('currency_boost'),
      cooldown: adService.getCooldownMinutes('currency_boost'),
    },
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] text-slate-100">
      {screen === 'home' ? (
        <HomeScreen
          onStart={handleStartGame}
          onOpenSongSelect={() => setScreen('song-select')}
          onOpenSettings={() => setScreen('settings')}
          onOpenStore={() => setScreen('store')}
          onOpenBattlePass={() => setScreen('battle-pass')}
          onOpenEvents={() => setScreen('events')}
          onOpenShare={() => setScreen('share')}
          lastTrack={lastTrack}
          mode={worldMode}
          onChangeMode={setWorldMode}
          upgrades={activeUpgrades}
          meta={metaProgress}
          currency={metaProgress.coins}
          challengeSummary={challengeSummary}
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
          temporaryUnlocks={sessionUnlocks}
        />
      ) : null}

      {screen === 'settings' ? (
        <SettingsScreen
          dprCap={dprCap}
          onChangeDpr={handleChangeDpr}
          reducedMotion={reducedMotionEnabled}
          onChangeReducedMotion={handleToggleReducedMotion}
          calibration={calibration}
          onChangeCalibration={handleChangeCalibration}
          audio={audio}
          audioSettings={audioSettings}
          onChangeAudioSettings={handleAudioSettingsChange}
          eqPresets={eqPresets}
          onBack={() => setScreen('home')}
        />
      ) : null}

      {screen === 'game' && selectedTrack ? (
        <GameScreen
          track={selectedTrack}
          audio={audio}
          dprCap={dprCap}
          calibration={calibration}
          upgrades={activeUpgrades}
          mode={worldMode}
          meta={metaProgress}
          onComplete={handleShowResults}
          onExit={handleExitGame}
          onRecorderReady={handleRecorderReady}
        />
      ) : null}

      {screen === 'results' && gameResult ? (
        <ResultsScreen
          track={gameResult.track}
          snapshot={gameResult.snapshot}
          onRetry={handleStartGame}
          onHome={() => setScreen('home')}
          onSongSelect={() => setScreen('song-select')}
          onSelectUpgrade={handleSelectUpgrade}
          upgrades={activeUpgrades}
          onOpenShare={() => setScreen('share')}
          onWatchAd={handleWatchAd}
          adAvailability={adAvailability}
          adStatus={adStatus}
        />
      ) : null}

      {screen === 'store' ? (
        <StoreScreen
          meta={metaProgress}
          config={remoteConfig}
          onBack={() => setScreen('home')}
          onCommitPurchase={handleStoreCommit}
          onPurchaseError={handleStoreError}
          onWatchAd={() => handleWatchAd('currency_boost')}
          adQuota={adAvailability.currency_boost.remaining}
          adCooldownMinutes={adAvailability.currency_boost.cooldown}
          message={storeMessage}
        />
      ) : null}

      {screen === 'battle-pass' ? (
        <BattlePassScreen
          meta={metaProgress}
          rewards={battlePassRewards}
          seasonEndsAt={metaProgress.battlePass.expiresAt}
          onClaim={handleClaimBattlePass}
          onUnlockPremium={handleUnlockPremium}
          onBack={() => setScreen('home')}
          onCopySeasonLink={handleCopySeasonLink}
          statusMessage={battlePassMessage}
        />
      ) : null}

      {screen === 'events' ? (
        <EventsScreen
          daily={dailyChallenge}
          weekly={weeklyChallenge}
          onBack={() => setScreen('home')}
          onClaimDaily={() => handleClaimChallenge('daily')}
          onClaimWeekly={() => handleClaimChallenge('weekly')}
          statusMessage={eventsMessage}
        />
      ) : null}

      {screen === 'share' ? (
        <ShareScreen
          exporter={shareExporter}
          presets={sharePresets}
          exports={shareHistory}
          onExport={handleShareExport}
          onBack={() => setScreen('home')}
          onCopyLink={handleCopyShareLink}
          shareLink={shareLink}
          statusMessage={shareStatusMessage}
        />
      ) : null}
    </div>
  )
}

export default App
