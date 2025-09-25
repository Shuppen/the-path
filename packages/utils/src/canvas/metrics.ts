import type { DevicePerformanceProfile, ViewportMetrics } from '@the-path/types'

import { getDevicePerformanceProfile } from './performance.js'

export interface ViewportMetricsOptions {
  devicePixelRatio?: number
  minDevicePixelRatio?: number
  maxDevicePixelRatio?: number
  performanceProfile?: DevicePerformanceProfile | (() => DevicePerformanceProfile)
  pixelBudget?: number
}

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const resolveProfile = (
  profile?: DevicePerformanceProfile | (() => DevicePerformanceProfile),
): DevicePerformanceProfile => {
  if (typeof profile === 'function') {
    const resolved = profile()
    return resolved ?? getDevicePerformanceProfile()
  }
  if (profile) {
    return profile
  }
  return getDevicePerformanceProfile()
}

export const getViewportMetrics = (
  canvas: HTMLCanvasElement,
  options: ViewportMetricsOptions = {},
): ViewportMetrics => {
  const width = Math.max(1, canvas.clientWidth || canvas.width || 1)
  const height = Math.max(1, canvas.clientHeight || canvas.height || 1)

  const profile = resolveProfile(options.performanceProfile)

  const baseDevicePixelRatio = options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1
  const minDevicePixelRatio = Math.max(1, options.minDevicePixelRatio ?? 1)
  const recommendedMax = options.maxDevicePixelRatio ?? profile.recommendedDevicePixelRatio
  const maxDevicePixelRatio = Math.max(minDevicePixelRatio, recommendedMax)

  let devicePixelRatio = clamp(baseDevicePixelRatio, minDevicePixelRatio, maxDevicePixelRatio)

  const pixelBudget = Math.max(0, options.pixelBudget ?? profile.pixelBudget ?? 0)
  if (pixelBudget > 0) {
    const estimatedPixels = width * height * devicePixelRatio * devicePixelRatio
    if (estimatedPixels > pixelBudget) {
      const scale = Math.sqrt(pixelBudget / Math.max(estimatedPixels, 1))
      if (Number.isFinite(scale) && scale > 0 && scale < 1) {
        devicePixelRatio = clamp(devicePixelRatio * scale, minDevicePixelRatio, maxDevicePixelRatio)
      }
    }
  }

  const metrics: ViewportMetrics = {
    width,
    height,
    devicePixelRatio,
    recommendedDevicePixelRatio: profile.recommendedDevicePixelRatio,
    pixelBudget: pixelBudget || undefined,
    qualityTier: profile.tier,
  }

  return metrics
}

export const resizeCanvasToDisplaySize = (
  canvas: HTMLCanvasElement,
  metrics: ViewportMetrics,
): void => {
  const width = Math.max(1, Math.floor(metrics.width * metrics.devicePixelRatio))
  const height = Math.max(1, Math.floor(metrics.height * metrics.devicePixelRatio))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

export const toCanvasCoordinates = (
  event: PointerEvent,
  metrics: ViewportMetrics,
): { x: number; y: number } => {
  const target = event.currentTarget as Element | null
  const rect = target?.getBoundingClientRect()

  if (!rect) {
    return { x: 0, y: 0 }
  }

  const scaleX = metrics.devicePixelRatio
  const scaleY = metrics.devicePixelRatio

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  }
}

export const areViewportMetricsEqual = (
  a: ViewportMetrics | null | undefined,
  b: ViewportMetrics | null | undefined,
): boolean => {
  if (!a || !b) return false
  if (a === b) return true
  return (
    a.width === b.width &&
    a.height === b.height &&
    Math.abs(a.devicePixelRatio - b.devicePixelRatio) < 0.001
  )
}
