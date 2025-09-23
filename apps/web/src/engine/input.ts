import type { Vector2, ViewportMetrics } from '@the-path/types'
import { toCanvasCoordinates } from '@the-path/utils'

export interface InputActions {
  jump: boolean
  restart: boolean
}

export interface InputSnapshot extends InputActions {
  pointer?: Vector2
}

export type MetricsProvider = () => ViewportMetrics | null

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ'])
const RESTART_KEYS = new Set(['KeyR', 'Enter'])

export class InputManager {
  private pointer?: Vector2
  private jumpRequested = false
  private restartRequested = false

  private readonly handlePointerMove = (event: PointerEvent) => {
    const metrics = this.getMetrics()
    if (!metrics) return
    this.pointer = toCanvasCoordinates(event, metrics)
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    const metrics = this.getMetrics()
    if (!metrics) return
    this.pointer = toCanvasCoordinates(event, metrics)
    this.jumpRequested = true
  }

  private readonly handlePointerLeave = () => {
    this.pointer = undefined
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return
    if (JUMP_KEYS.has(event.code)) {
      this.jumpRequested = true
    }
    if (RESTART_KEYS.has(event.code)) {
      this.restartRequested = true
    }
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getMetrics: MetricsProvider
  ) {}

  bind(): void {
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('blur', this.handlePointerLeave)
  }

  unbind(): void {
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('blur', this.handlePointerLeave)
  }

  getPointer(): Vector2 | undefined {
    return this.pointer
  }

  consumeActions(): InputSnapshot {
    const snapshot: InputSnapshot = {
      jump: this.jumpRequested,
      restart: this.restartRequested,
      pointer: this.pointer,
    }

    this.jumpRequested = false
    this.restartRequested = false

    return snapshot
  }
}
