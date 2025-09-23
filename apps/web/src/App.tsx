import { useEffect, useRef } from 'react'
import type { SceneState, Vector2, ViewportMetrics } from '@the-path/types'
import {
  createAnimationLoop,
  getViewportMetrics,
  resizeCanvasToDisplaySize,
  toCanvasCoordinates,
} from '@the-path/utils'

const drawScene = (
  ctx: CanvasRenderingContext2D,
  metrics: ViewportMetrics,
  state: SceneState
): void => {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)

  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    Math.min(width, height) * 0.15,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.75
  )

  gradient.addColorStop(0, '#0f172a')
  gradient.addColorStop(0.45, '#1e293b')
  gradient.addColorStop(1, '#020617')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const pulse = Math.sin(state.timestamp / 600) * 0.25 + 0.75
  const focus = state.pointer ?? {
    x: width / 2 + Math.sin(state.timestamp / 1100) * width * 0.1,
    y: height / 2 + Math.cos(state.timestamp / 900) * height * 0.1,
  }

  const radius = Math.max(width, height) * 0.18 * pulse
  const intensity = state.pointer ? 0.6 : 0.35

  const flare = ctx.createRadialGradient(focus.x, focus.y, radius * 0.3, focus.x, focus.y, radius)
  flare.addColorStop(0, `rgba(56, 189, 248, ${0.9 * intensity})`)
  flare.addColorStop(0.35, `rgba(56, 189, 248, ${0.6 * intensity})`)
  flare.addColorStop(1, 'rgba(15, 23, 42, 0)')
  ctx.fillStyle = flare
  ctx.beginPath()
  ctx.arc(focus.x, focus.y, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(94, 234, 212, 0.45)'
  ctx.lineWidth = 1.5 * metrics.devicePixelRatio
  ctx.beginPath()
  const lines = 5
  for (let i = 0; i < lines; i += 1) {
    const t = (state.timestamp / 300 + i / lines) % 1
    const angle = t * Math.PI * 2
    const inner = radius * 0.75
    const outer = radius * 1.35
    ctx.moveTo(focus.x + Math.cos(angle) * inner, focus.y + Math.sin(angle) * inner)
    ctx.lineTo(focus.x + Math.cos(angle) * outer, focus.y + Math.sin(angle) * outer)
  }
  ctx.stroke()
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const metricsRef = useRef<ViewportMetrics | null>(null)
  const pointerRef = useRef<Vector2 | undefined>(undefined)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return undefined

    const updateMetrics = () => {
      const metrics = getViewportMetrics(canvas)
      metricsRef.current = metrics
      resizeCanvasToDisplaySize(canvas, metrics)
    }

    const handleResize = () => updateMetrics()

    const handlePointerMove = (event: PointerEvent) => {
      const metrics = metricsRef.current
      if (!metrics) return
      pointerRef.current = toCanvasCoordinates(event, metrics)
    }

    const handlePointerLeave = () => {
      pointerRef.current = undefined
    }

    updateMetrics()

    const resizeObserver = new ResizeObserver(() => updateMetrics())
    resizeObserver.observe(canvas)

    window.addEventListener('resize', handleResize)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', handlePointerLeave)

    const stop = createAnimationLoop((state) => {
      const metrics = metricsRef.current
      if (!metrics) return

      resizeCanvasToDisplaySize(canvas, metrics)
      drawScene(ctx, metrics, {
        ...state,
        pointer: pointerRef.current,
      })
    })

    return () => {
      stop()
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 px-6 py-12">
        <header className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-300/80">
            the path · mvp canvas scene
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Calibrate the stage for immersive narratives
          </h1>
          <p className="text-pretty text-base text-slate-300 sm:text-lg">
            Interactive canvas baseline with responsive metrics, animation loop utilities, and pointer-driven lighting to anchor the web experience.
          </p>
        </header>

        <section className="w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl ring-1 ring-white/10">
          <canvas
            ref={canvasRef}
            className="h-[360px] w-full cursor-crosshair bg-transparent sm:h-[420px]"
            role="presentation"
          />
        </section>

        <footer className="grid w-full gap-6 text-sm text-slate-400 sm:grid-cols-3">
          <div>
            <p className="font-medium text-slate-200">60 FPS target</p>
            <p className="text-pretty">
              Lightweight scene primitives keep render times low, providing enough headroom to layer storytelling UI on top.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-200">Sub-100ms TTI</p>
            <p className="text-pretty">
              Vite + pnpm cold starts stay lean, while eager canvas setup defers heavy work until first frame.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-200">Composable utilities</p>
            <p className="text-pretty">
              Shared packages expose viewport metrics and animation helpers for future apps in the monorepo.
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default App
