export type Vector2 = {
  x: number
  y: number
}

export type DevicePerformanceTier = 'low' | 'medium' | 'high'

export interface DevicePerformanceProfile {
  tier: DevicePerformanceTier
  hardwareConcurrency?: number
  deviceMemory?: number
  recommendedDevicePixelRatio: number
  pixelBudget: number
  reasons: string[]
  isMobile?: boolean
  prefersReducedMotion?: boolean
}

export interface ViewportMetrics {
  width: number
  height: number
  devicePixelRatio: number
  recommendedDevicePixelRatio?: number
  pixelBudget?: number
  qualityTier?: DevicePerformanceTier
}

export interface SceneState {
  timestamp: number
  pointer?: Vector2
}
