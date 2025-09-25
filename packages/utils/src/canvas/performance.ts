import type { DevicePerformanceProfile, DevicePerformanceTier } from '@the-path/types'

export interface DevicePerformanceOptions {
  devicePixelRatio?: number
  canvasWidth?: number
  canvasHeight?: number
  maxDevicePixelRatio?: number
  pixelBudget?: number
}

const TIER_PRIORITY: Record<DevicePerformanceTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

const DEFAULT_PIXEL_BUDGET: Record<DevicePerformanceTier, number> = {
  low: 1_048_576, // ~1 MP
  medium: 1_835_008, // ~1.75 MP
  high: 2_621_440, // ~2.5 MP
}

const uniquePush = (items: string[], value: string): void => {
  if (!value) return
  if (items.includes(value)) return
  items.push(value)
}

const resolveNavigator = (): Navigator | undefined => {
  return typeof navigator !== 'undefined' ? navigator : undefined
}

const resolveWindow = (): Window | undefined => {
  return typeof window !== 'undefined' ? window : undefined
}

const downgradeTier = (
  current: DevicePerformanceTier,
  next: DevicePerformanceTier,
): DevicePerformanceTier => {
  if (TIER_PRIORITY[next] < TIER_PRIORITY[current]) {
    return next
  }
  return current
}

export const getDevicePerformanceProfile = (
  options: DevicePerformanceOptions = {},
): DevicePerformanceProfile => {
  const nav = resolveNavigator()
  const win = resolveWindow()
  const hardwareConcurrency = typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined
  const deviceMemory = typeof (nav as { deviceMemory?: number } | undefined)?.deviceMemory === 'number'
    ? (nav as { deviceMemory?: number }).deviceMemory
    : undefined
  const userAgentData = (nav as { userAgentData?: { mobile?: boolean } } | undefined)?.userAgentData
  const connection = (nav as { connection?: { effectiveType?: string; saveData?: boolean } } | undefined)?.connection
  const effectiveType = connection?.effectiveType
  const saveData = connection?.saveData ?? false
  const prefersReducedMotion = win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const coarsePointer = win?.matchMedia?.('(pointer: coarse)').matches ?? false
  const isMobile = Boolean(userAgentData?.mobile ?? coarsePointer)

  const baseDevicePixelRatio = Math.max(
    1,
    options.devicePixelRatio ?? win?.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1,
  )

  let tier: DevicePerformanceTier = 'high'
  const reasons: string[] = []

  if (saveData) {
    tier = downgradeTier(tier, 'low')
    uniquePush(reasons, 'Data saver enabled')
  }

  if (typeof deviceMemory === 'number') {
    if (deviceMemory <= 3) {
      tier = downgradeTier(tier, 'low')
      uniquePush(reasons, 'Low device memory detected')
    } else if (deviceMemory <= 5) {
      tier = downgradeTier(tier, 'medium')
      uniquePush(reasons, 'Limited device memory detected')
    }
  }

  if (typeof hardwareConcurrency === 'number') {
    if (hardwareConcurrency <= 2) {
      tier = downgradeTier(tier, 'low')
      uniquePush(reasons, 'Two or fewer CPU cores available')
    } else if (hardwareConcurrency <= 4) {
      tier = downgradeTier(tier, 'medium')
      uniquePush(reasons, 'Moderate CPU core availability')
    }
  }

  if (isMobile && (hardwareConcurrency ?? 0) <= 4) {
    tier = downgradeTier(tier, 'low')
    uniquePush(reasons, 'Mobile device with constrained CPU budget')
  }

  if (prefersReducedMotion) {
    tier = downgradeTier(tier, 'medium')
    uniquePush(reasons, 'Reduced motion preference enabled')
  }

  if (typeof effectiveType === 'string') {
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      tier = downgradeTier(tier, 'low')
      uniquePush(reasons, 'Very slow network connection reported')
    } else if (effectiveType === '3g') {
      tier = downgradeTier(tier, 'medium')
      uniquePush(reasons, 'Slow network connection reported')
    }
  }

  const defaultTierCap = tier === 'high' ? 3 : tier === 'medium' ? 2.3 : 1.6
  const maxDevicePixelRatio = Math.max(1, options.maxDevicePixelRatio ?? defaultTierCap)
  let recommendedDevicePixelRatio = Math.min(baseDevicePixelRatio, maxDevicePixelRatio)

  const canvasWidth = Math.max(0, options.canvasWidth ?? win?.innerWidth ?? 0)
  const canvasHeight = Math.max(0, options.canvasHeight ?? win?.innerHeight ?? 0)
  const pixelBudget = Math.max(0, options.pixelBudget ?? DEFAULT_PIXEL_BUDGET[tier])

  if (pixelBudget > 0 && canvasWidth > 0 && canvasHeight > 0) {
    const estimatedPixels = canvasWidth * canvasHeight * recommendedDevicePixelRatio * recommendedDevicePixelRatio
    if (estimatedPixels > pixelBudget) {
      const scale = Math.sqrt(pixelBudget / estimatedPixels)
      if (Number.isFinite(scale) && scale > 0 && scale < 1) {
        recommendedDevicePixelRatio = Math.max(1, recommendedDevicePixelRatio * scale)
        uniquePush(reasons, 'Clamped device pixel ratio to stay within pixel budget')
      }
    }
  }

  return {
    tier,
    hardwareConcurrency,
    deviceMemory,
    recommendedDevicePixelRatio,
    pixelBudget,
    reasons,
    isMobile,
    prefersReducedMotion,
  }
}
