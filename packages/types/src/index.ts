export type Vector2 = {
  x: number
  y: number
}

export interface ViewportMetrics {
  width: number
  height: number
  devicePixelRatio: number
}

export interface SceneState {
  timestamp: number
  pointer?: Vector2
}
