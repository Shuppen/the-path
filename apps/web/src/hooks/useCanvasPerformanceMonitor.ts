import { useEffect, useRef, useState } from 'react'

interface UseCanvasPerformanceMonitorOptions {
  enabled?: boolean
  sampleIntervalMs?: number
}

interface CanvasPerformanceSample {
  fps: number
  frameTime: number
}

const DEFAULT_SAMPLE_INTERVAL = 1000

const createInitialSample = (): CanvasPerformanceSample => ({ fps: 0, frameTime: 0 })

export const useCanvasPerformanceMonitor = (
  options: UseCanvasPerformanceMonitorOptions,
): CanvasPerformanceSample => {
  const { enabled = true, sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL } = options
  const [sample, setSample] = useState<CanvasPerformanceSample>(createInitialSample)
  const timestampsRef = useRef<number[]>([])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setSample(createInitialSample())
      return undefined
    }

    let rafId = 0

    const recordFrame = (timestamp: number) => {
      timestampsRef.current.push(timestamp)
      const cutoff = timestamp - sampleIntervalMs
      const queue = timestampsRef.current
      while (queue.length > 0 && queue[0] < cutoff) {
        queue.shift()
      }
      rafId = requestAnimationFrame(recordFrame)
    }

    const publishSample = () => {
      const queue = timestampsRef.current
      if (queue.length <= 1) {
        setSample((previous) => {
          if (previous.fps === 0 && previous.frameTime === 0) {
            return previous
          }
          return createInitialSample()
        })
        return
      }

      const elapsed = queue[queue.length - 1] - queue[0]
      if (elapsed <= 0) return

      const frames = queue.length - 1
      const fps = (frames * 1000) / elapsed
      const frameTime = elapsed / frames

      setSample((previous) => {
        if (Math.abs(previous.fps - fps) < 0.5 && Math.abs(previous.frameTime - frameTime) < 0.2) {
          return previous
        }
        return { fps, frameTime }
      })
    }

    rafId = requestAnimationFrame(recordFrame)
    const intervalId = window.setInterval(publishSample, Math.max(250, sampleIntervalMs))

    return () => {
      cancelAnimationFrame(rafId)
      window.clearInterval(intervalId)
      timestampsRef.current = []
    }
  }, [enabled, sampleIntervalMs])

  return sample
}
