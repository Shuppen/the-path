import { useEffect, useRef } from 'react'
import type { WebAudioAnalysis, BeatEvent, OnsetEvent, BeatGridState } from '../audio/WebAudioAnalysis'

interface BeatDebugOverlayProps {
  audio: WebAudioAnalysis
  canvasRef: React.RefObject<HTMLCanvasElement>
}

const MAX_HISTORY = 64
const WINDOW_SECONDS = 4

const clamp01 = (value: number): number => {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

export function BeatDebugOverlay({ audio, canvasRef }: BeatDebugOverlayProps) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const beatsRef = useRef<BeatEvent[]>([])
  const onsetsRef = useRef<OnsetEvent[]>([])
  const gridRef = useRef<BeatGridState | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const overlay = overlayRef.current
    const baseCanvas = canvasRef.current
    if (!overlay || !baseCanvas) return undefined

    const resize = () => {
      const rect = baseCanvas.getBoundingClientRect()
      overlay.width = rect.width
      overlay.height = rect.height
    }

    resize()

    const observer = new ResizeObserver(() => resize())
    observer.observe(baseCanvas)

    return () => {
      observer.disconnect()
    }
  }, [canvasRef])

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const detachBeat = audio.onBeat((event) => {
      beatsRef.current.push(event)
      if (beatsRef.current.length > MAX_HISTORY) {
        beatsRef.current.shift()
      }
    })
    const detachOnset = audio.onOnset((event) => {
      onsetsRef.current.push(event)
      if (onsetsRef.current.length > MAX_HISTORY) {
        onsetsRef.current.shift()
      }
    })
    const detachGrid = audio.onGrid((grid) => {
      gridRef.current = grid
    })

    return () => {
      detachBeat()
      detachOnset()
      detachGrid()
    }
  }, [audio])

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const overlay = overlayRef.current
    if (!overlay) return undefined
    const ctx = overlay.getContext('2d')
    if (!ctx) return undefined

    const render = () => {
      const width = overlay.width
      const height = overlay.height
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(12, 18, 30, 0.45)'
      ctx.fillRect(0, 0, width, height)

      const currentTime = audio.getCurrentTime()
      const startTime = currentTime - WINDOW_SECONDS

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, height * 0.5)
      ctx.lineTo(width, height * 0.5)
      ctx.stroke()

      const grid = gridRef.current
      if (grid) {
        const interval = grid.interval
        const first = Math.floor(startTime / interval)
        const last = Math.ceil(currentTime / interval)
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)'
        ctx.lineWidth = 1
        for (let i = first; i <= last; i += 1) {
          const beatTime = i * interval
          if (beatTime < startTime) continue
          const ratio = 1 - (currentTime - beatTime) / WINDOW_SECONDS
          const x = width * clamp01(ratio)
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
          ctx.stroke()
        }
      }

      const beats = beatsRef.current.filter((event) => event.time >= startTime)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.85)'
      for (const beat of beats) {
        const ratio = 1 - (currentTime - beat.time) / WINDOW_SECONDS
        const x = width * clamp01(ratio)
        const radius = 6 + clamp01(beat.confidence / 3) * 10
        ctx.beginPath()
        ctx.arc(x, height * 0.35, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      const onsets = onsetsRef.current.filter((event) => event.time >= startTime)
      ctx.fillStyle = 'rgba(248, 113, 113, 0.7)'
      for (const onset of onsets) {
        const ratio = 1 - (currentTime - onset.time) / WINDOW_SECONDS
        const x = width * clamp01(ratio)
        const heightScale = clamp01(onset.strength / 3)
        ctx.fillRect(x - 2, height * (0.75 - heightScale * 0.25), 4, height * 0.25 * heightScale)
      }

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [audio])

  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <canvas
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-30 mix-blend-screen"
      aria-hidden="true"
    />
  )
}

export default BeatDebugOverlay
