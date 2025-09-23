import type { Vector2, ViewportMetrics } from '@the-path/types'
import { toCanvasCoordinates } from '@the-path/utils'

export interface InputActions {
  jump: boolean
  restart: boolean
}

export interface InputSnapshot extends InputActions {
  jumpHoldDuration: number
  pointer?: Vector2
}

export type MetricsProvider = () => ViewportMetrics | null

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ'])
const RESTART_KEYS = new Set(['KeyR', 'Enter'])

const getTimestamp = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export class InputManager {
  private pointer?: Vector2
  private jumpRequested = false
  private restartRequested = false
  private jumpHoldStart: number | null = null
  private readonly jumpHoldSources = new Set<'pointer' | 'keyboard'>()

  private startJumpHold(source: 'pointer' | 'keyboard') {
    if (!this.jumpHoldSources.has(source) && this.jumpHoldSources.size === 0) {
      this.jumpHoldStart = getTimestamp()
    }
    this.jumpHoldSources.add(source)
  }

  private endJumpHold(source: 'pointer' | 'keyboard') {
    if (!this.jumpHoldSources.has(source)) return
    this.jumpHoldSources.delete(source)
    if (this.jumpHoldSources.size === 0) {
      this.jumpHoldStart = null
    }
  }

  private resetJumpHold() {
    this.jumpHoldSources.clear()
    this.jumpHoldStart = null
  }

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
    this.startJumpHold('pointer')
  }

  private readonly handlePointerLeave = () => {
    this.pointer = undefined
    this.endJumpHold('pointer')
  }

  private readonly handlePointerUp = () => {
    this.endJumpHold('pointer')
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return
    if (JUMP_KEYS.has(event.code)) {
      this.jumpRequested = true
      this.startJumpHold('keyboard')
    }
    if (RESTART_KEYS.has(event.code)) {
      this.restartRequested = true
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    if (JUMP_KEYS.has(event.code)) {
      this.endJumpHold('keyboard')
    }
  }

  private readonly handleWindowBlur = () => {
    this.pointer = undefined
    this.resetJumpHold()
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getMetrics: MetricsProvider
  ) {}

  bind(): void {
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave)
    window.addEventListener('pointerup', this.handlePointerUp)
    window.addEventListener('pointercancel', this.handlePointerUp)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleWindowBlur)
  }

  unbind(): void {
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('pointercancel', this.handlePointerUp)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleWindowBlur)
  }

  getPointer(): Vector2 | undefined {
    return this.pointer
  }

  consumeActions(): InputSnapshot {
    const holdDuration =
      this.jumpHoldStart !== null ? Math.max(0, (getTimestamp() - this.jumpHoldStart) / 1000) : 0

    const snapshot: InputSnapshot = {
      jump: this.jumpRequested,
      restart: this.restartRequested,
      pointer: this.pointer,
      jumpHoldDuration: holdDuration,
    }

    this.jumpRequested = false
    this.restartRequested = false

    return snapshot
  }
}
