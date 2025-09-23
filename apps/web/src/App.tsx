import { useCallback, useEffect, useRef, useState } from 'react'
import type { ViewportMetrics } from '@the-path/types'
import { getViewportMetrics, resizeCanvasToDisplaySize } from '@the-path/utils'

import { createSeed } from './core/prng'
import { createGameLoop } from './engine/loop'
import { InputManager } from './engine/input'
import { SceneRenderer } from './render/sceneRenderer'
import { World, type WorldSnapshot } from './world'

const padScore = (value: number): string => value.toString().padStart(6, '0')

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const metricsRef = useRef<ViewportMetrics | null>(null)
  const worldRef = useRef<World | null>(null)
  const seedRef = useRef<string>(createSeed())

  const [hud, setHud] = useState<WorldSnapshot>(() => ({
    score: 0,
    combo: 0,
    bestCombo: 0,
    status: 'running',
    seed: seedRef.current,
  }))

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

    return () => {
      loop.stop()
      input.unbind()
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateMetrics)
      if (worldRef.current === world) worldRef.current = null
    }
  }, [pushHud])

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12">
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
                {hud.status === 'gameover' ? 'Signal lost · tap or press Space/R to restart' : 'Stay in rhythm · jump with Space, click or tap'}
              </p>
              <p className="font-mono text-[0.8rem] text-slate-400 sm:text-xs">
                Fixed timestep · deterministic PRNG · Beat generator BPM 108
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
