import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DevicePerformanceProfile, ViewportMetrics } from '@the-path/types'
import {
  areViewportMetricsEqual,
  getDevicePerformanceProfile,
  getViewportMetrics,
  resizeCanvasToDisplaySize,
} from '@the-path/utils'

import type { AudioTrackManifestEntry } from '../assets/tracks'
import type { WebAudioAnalysis, AudioPlaybackState, ProgressEvent } from '../audio/WebAudioAnalysis'
import { createSeed } from '../core/prng'
import { createGameLoop, type LoopController } from '../engine/loop'
import { InputManager } from '../engine/input'
import { SceneRenderer } from '../render/sceneRenderer'
import {
  World,
  type WorldSnapshot,
  type CalibrationSettings,
  type ActiveUpgrade,
  type WorldMode,
  type MetaProgressState,
  type WorldAudioEvent,
} from '../world'
import PauseScreen from './Pause'
import { padScore } from '../ui/scoreFormatting'
import BeatDebugOverlay from '../ui/BeatDebugOverlay'
import ReplayClipExporter from '../share/ReplayClipExporter'

interface GameScreenProps {
  track: AudioTrackManifestEntry
  audio: WebAudioAnalysis
  dprCap: number
  calibration: CalibrationSettings
  upgrades: ActiveUpgrade[]
  mode: WorldMode
  meta: MetaProgressState
  onComplete: (snapshot: WorldSnapshot) => void
  onExit: (snapshot: WorldSnapshot | null) => void
  onRecorderReady?: (exporter: ReplayClipExporter | null) => void
}

interface HudState {
  score: number
  combo: number
  bestCombo: number
  accuracy: number
  comboMultiplier: number
  feverMeter: number
  health: number
  playback: AudioPlaybackState
  progress: ProgressEvent | null
}

const initialHudState: HudState = {
  score: 0,
  combo: 0,
  bestCombo: 0,
  accuracy: 1,
  comboMultiplier: 1,
  feverMeter: 0,
  health: 3,
  playback: 'idle',
  progress: null,
}

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function GameScreen({
  track,
  audio,
  dprCap,
  calibration,
  upgrades,
  mode,
  meta,
  onComplete,
  onExit,
  onRecorderReady,
}: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const loopRef = useRef<LoopController | null>(null)
  const inputRef = useRef<InputManager | null>(null)
  const rendererRef = useRef<SceneRenderer | null>(null)
  const worldRef = useRef<World | null>(null)
  const metricsRef = useRef<ViewportMetrics | null>(null)
  const profileRef = useRef<DevicePerformanceProfile | null>(null)
  const replayRef = useRef<ReplayClipExporter | null>(null)
  const [hud, setHud] = useState<HudState>(initialHudState)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionSeed, setSessionSeed] = useState(() => createSeed())
  const completionGuard = useRef(false)

  const selectedTrack = useMemo(() => track, [track])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      onRecorderReady?.(null)
      return undefined
    }

    const exporter = new ReplayClipExporter(canvas, audio)
    if (!exporter.isSupported()) {
      onRecorderReady?.(null)
      exporter.destroy()
      return undefined
    }

    replayRef.current = exporter
    exporter.start()
    onRecorderReady?.(exporter)

    return () => {
      exporter.stop()
      exporter.destroy()
      if (replayRef.current === exporter) {
        replayRef.current = null
      }
      onRecorderReady?.(null)
    }
  }, [audio, onRecorderReady])

  const updateHudFromWorld = useCallback((world: World) => {
    const snapshot = world.snapshot()
    setHud((previous) => ({
      ...previous,
      score: snapshot.score,
      combo: snapshot.combo,
      bestCombo: snapshot.bestCombo,
      accuracy: snapshot.accuracy,
      comboMultiplier: world.state.comboMultiplier,
      feverMeter: world.state.feverMeter,
      health: world.state.runner.health,
    }))
  }, [])

  const handleWorldAudioEvents = useCallback(
    (events: WorldAudioEvent[]) => {
      if (!events.length) return
      for (const event of events) {
        switch (event.type) {
          case 'hit': {
            const intensity = clamp(event.combo / 24 + (event.judgement === 'perfect' ? 1 : 0.75), 0.5, 2)
            const preset = event.judgement === 'perfect' ? 'perfect' : 'tap'
            audio.playSfx(preset, { intensity })
            break
          }
          case 'miss': {
            audio.playSfx('miss', { intensity: 1 })
            audio.triggerMissDucking()
            break
          }
          case 'lane-shift': {
            audio.playSfx('lane-shift', { intensity: 0.65 })
            break
          }
          case 'fever': {
            if (event.state === 'start') {
              audio.playSfx('fever-start', { intensity: 1.1 })
            }
            break
          }
          default:
            break
        }
      }
    },
    [audio],
  )

  const teardown = useCallback(() => {
    loopRef.current?.stop()
    loopRef.current = null
    inputRef.current?.unbind()
    inputRef.current = null
    rendererRef.current?.dispose()
    rendererRef.current = null
    worldRef.current = null
  }, [])

  const commitMetrics = useCallback((metrics: ViewportMetrics) => {
    metricsRef.current = metrics
  }, [])

  const updateMetrics = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const profile = getDevicePerformanceProfile({
      canvasWidth: canvas.clientWidth,
      canvasHeight: canvas.clientHeight,
      maxDevicePixelRatio: dprCap,
      devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    })
    profileRef.current = profile
    const metrics = getViewportMetrics(canvas, {
      performanceProfile: profile,
      maxDevicePixelRatio: dprCap,
      pixelBudget: profile.pixelBudget,
    })
    const previous = metricsRef.current
    if (!areViewportMetricsEqual(previous, metrics)) {
      resizeCanvasToDisplaySize(canvas, metrics)
      commitMetrics(metrics)
      worldRef.current?.setViewport(canvas.width, canvas.height)
    }
  }, [commitMetrics, dprCap])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    teardown()
    completionGuard.current = false
    setPaused(false)

    const context =
      canvas.getContext('2d', { alpha: false, desynchronized: true }) ?? canvas.getContext('2d', { alpha: false })
    if (!context) {
      return undefined
    }

    const world = new World({
      seed: sessionSeed,
      width: canvas.width,
      height: canvas.height,
      calibration,
      upgrades,
      mode,
      meta,
    })
    world.state.status = 'running'
    worldRef.current = world
    updateMetrics()
    world.setViewport(canvas.width, canvas.height)

    world.attachTimeSource(() => {
      if (audio.getState() === 'playing' || audio.getState() === 'paused' || audio.getState() === 'ready') {
        return audio.getCurrentTime()
      }
      return world.state.time
    })

    const renderer = new SceneRenderer(context)
    rendererRef.current = renderer

    const input = new InputManager(canvas, () => metricsRef.current)
    input.bind()
    inputRef.current = input

    setHud((previous) => ({
      ...initialHudState,
      playback: previous.playback,
      progress: previous.progress,
      comboMultiplier: world.state.comboMultiplier,
      feverMeter: world.state.feverMeter,
      health: world.state.runner.health,
    }))

    const loop = createGameLoop(
      {
        update: (dt) => {
          const world = worldRef.current
          if (!world) return
          const frame = input.consumeFrame()
          world.update({ frame, dt })
          const events = world.consumeAudioEvents()
          if (events.length) {
            handleWorldAudioEvents(events)
          }
          audio.updatePerformanceState({
            combo: world.state.runner.combo,
            feverActive: world.state.runner.feverActive,
            feverLevel: world.state.runner.feverMeter,
          })
          updateHudFromWorld(world)
        },
        render: () => {
          if (!worldRef.current || !rendererRef.current) return
          rendererRef.current.render(worldRef.current.state)
        },
      },
      {
        performanceProfile: () => profileRef.current ?? undefined,
      },
    )

    loop.start()
    loopRef.current = loop

    const resizeHandler = () => updateMetrics()
    window.addEventListener('resize', resizeHandler)
    window.addEventListener('orientationchange', resizeHandler)

    return () => {
      window.removeEventListener('resize', resizeHandler)
      window.removeEventListener('orientationchange', resizeHandler)
      teardown()
    }
  }, [
    audio,
    calibration,
    meta,
    mode,
    sessionSeed,
    teardown,
    updateHudFromWorld,
    updateMetrics,
    upgrades,
    handleWorldAudioEvents,
  ])

  useEffect(() => {
    if (!worldRef.current) return
    worldRef.current.setCalibration(calibration)
  }, [calibration])

  useEffect(() => {
    if (!worldRef.current) return
    worldRef.current.setActiveUpgrades(upgrades)
  }, [upgrades])

  useEffect(() => {
    const world = worldRef.current
    if (!world) return undefined

    const detachBeat = audio.onBeat(({ time, confidence }) => {
      const calibrationOffset = (world.state.calibration.audioOffsetMs ?? 0) / 1000
      const quantized = audio.quantizeTime(time + calibrationOffset, 4)
      world.syncToBeat(time, confidence, quantized.target)
    })
    const detachEnergy = audio.onEnergySpike(({ intensity }) => {
      world.applyEnergySpike(intensity)
    })
    const detachBreak = audio.onBreak(({ duration }) => {
      world.applyBreak(duration)
    })
    const detachProgress = audio.onProgress((progress) => {
      setHud((previous) => ({ ...previous, progress }))
    })
    const detachState = audio.onStateChange((state) => {
      setHud((previous) => ({ ...previous, playback: state }))
      if (state === 'playing') {
        setLoading(false)
        world.state.status = 'running'
      }
      if (state === 'paused') {
        world.state.status = 'paused'
      }
      if (state === 'ended' && !completionGuard.current) {
        completionGuard.current = true
        world.completeRun()
        onComplete(world.snapshot())
      }
    })

    return () => {
      detachBeat()
      detachEnergy()
      detachBreak()
      detachProgress()
      detachState()
    }
  }, [audio, onComplete, sessionSeed])

  useEffect(() => {
    setLoading(true)
    audio.stop()
    audio.load(selectedTrack).then(() => {
      audio.play().catch(() => {
        setLoading(false)
      })
    })
  }, [audio, selectedTrack])

  const handlePauseToggle = useCallback(() => {
    if (paused) {
      setPaused(false)
      if (worldRef.current?.state) {
        worldRef.current.state.status = 'running'
      }
      audio.play().catch(() => undefined)
    } else {
      setPaused(true)
      if (worldRef.current?.state) {
        worldRef.current.state.status = 'paused'
      }
      audio.pause()
    }
  }, [audio, paused])

  const restartRun = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    const nextSeed = createSeed()
    setSessionSeed(nextSeed)
    world.reset(nextSeed)
    world.state.status = 'running'
    completionGuard.current = false
    setHud(initialHudState)
    audio.stop()
    audio.play().catch(() => undefined)
    setPaused(false)
  }, [audio])

  const exitToMenu = useCallback(() => {
    const snapshot = worldRef.current?.snapshot() ?? null
    audio.pause()
    onExit(snapshot)
  }, [audio, onExit])

  const accuracyPercent = useMemo(() => Math.round(hud.accuracy * 100), [hud.accuracy])

  useEffect(() => {
    setSessionSeed(createSeed())
  }, [track.id])

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0B0F14] text-slate-100" data-testid="game-screen">
      <header className="pointer-events-none flex items-center justify-between px-6 pt-6">
        <div className="pointer-events-auto rounded-2xl border border-slate-700/60 bg-slate-900/60 px-4 py-2 shadow-lg">
          <p className="text-xs font-semibold text-white">{selectedTrack.title}</p>
          <p className="text-[0.65rem] text-slate-400">{selectedTrack.artist}</p>
          <p className="mt-1 text-[0.65rem] uppercase tracking-[0.25em] text-cyan-300/70">{mode === 'endless' ? 'Endless' : 'Track'}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          <div className="text-right">
            <p className="font-mono text-2xl text-white">{padScore(hud.score)}</p>
            <p className="text-xs text-cyan-200">Комбо {hud.combo} ×{hud.comboMultiplier}</p>
            <p className="text-[0.65rem] text-rose-200/80">HP {hud.health}</p>
          </div>
          <button
            type="button"
            onClick={handlePauseToggle}
            className="rounded-full border border-slate-700/60 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            {paused ? 'Продолжить' : 'Пауза'}
          </button>
        </div>
      </header>

      <div className="flex-1 px-6 py-4">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-md overflow-hidden rounded-[2.5rem] border border-slate-700/60 bg-slate-900">
          <canvas ref={canvasRef} className="h-full w-full" role="presentation" style={{ touchAction: 'none' }} />
          {import.meta.env.DEV ? <BeatDebugOverlay audio={audio} canvasRef={canvasRef} /> : null}
          {paused ? (
            <PauseScreen
              onResume={handlePauseToggle}
              onRestart={restartRun}
              onQuit={exitToMenu}
            />
          ) : null}
          {loading ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0B0F14]/70">
              <p className="text-sm text-slate-300">Загрузка трека…</p>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="px-6 pb-8">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span>Точность {accuracyPercent}%</span>
          <span>
            {hud.progress ? `${Math.floor(hud.progress.progress * 100)}%` : hud.playback === 'loading' ? 'Подготовка…' : ''}
          </span>
          <span className="text-xs text-cyan-200">Фивер {Math.round(hud.feverMeter * 100)}%</span>
        </div>
      </footer>
    </div>
  )
}

export default GameScreen
