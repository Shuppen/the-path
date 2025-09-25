import type { ViewportMetrics } from '@the-path/types'
import { toCanvasCoordinates } from '@the-path/utils'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

export interface InputFrame {
  tapLane: number | null
  swipe: SwipeDirection | null
}

export type MetricsProvider = () => ViewportMetrics | null

const KEYBOARD_LANE_MAP: Record<string, number | undefined> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  KeyF: 3,
}

const KEYBOARD_SWIPE_MAP: Record<string, SwipeDirection | undefined> = {
  ArrowLeft: 'left',
  KeyJ: 'left',
  ArrowRight: 'right',
  KeyL: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

const resolveTimestamp = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

interface ActivePointer {
  id: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  startedAt: number
}

const SWIPE_DISTANCE_DP = 28
const SWIPE_MAX_DURATION_MS = 180

const distanceSquared = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

const determineSwipeDirection = (dx: number, dy: number): SwipeDirection => {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left'
  }
  return dy > 0 ? 'down' : 'up'
}

export class InputManager {
  private readonly taps: number[] = []
  private readonly swipes: SwipeDirection[] = []
  private readonly pointers = new Map<number, ActivePointer>()
  private readonly preventContextMenu = (event: Event) => {
    event.preventDefault()
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getMetrics: MetricsProvider,
  ) {}

  private getSwipeThreshold(): number {
    const metrics = this.getMetrics()
    const dpr = metrics?.devicePixelRatio ?? 1
    const threshold = SWIPE_DISTANCE_DP * dpr
    return threshold * threshold
  }

  private resolveLane(x: number): number | null {
    const metrics = this.getMetrics()
    if (!metrics || metrics.width <= 0) return null
    const laneWidth = metrics.width / 4
    if (laneWidth <= 0) return null
    const lane = Math.floor(x / laneWidth)
    if (lane < 0 || lane > 3) {
      return null
    }
    return lane
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' && event.cancelable) {
      event.preventDefault()
    }

    const metrics = this.getMetrics()
    if (!metrics) return

    const point = toCanvasCoordinates(event, metrics)
    const pointer: ActivePointer = {
      id: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      startedAt: resolveTimestamp(),
    }
    this.pointers.set(event.pointerId, pointer)
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    const active = this.pointers.get(event.pointerId)
    if (!active) return
    const metrics = this.getMetrics()
    if (!metrics) return
    const point = toCanvasCoordinates(event, metrics)
    active.lastX = point.x
    active.lastY = point.y
  }

  private readonly handlePointerEnd = (event: PointerEvent) => {
    const active = this.pointers.get(event.pointerId)
    if (!active) return
    this.pointers.delete(event.pointerId)

    const metrics = this.getMetrics()
    if (!metrics) return
    const point = toCanvasCoordinates(event, metrics)

    const duration = resolveTimestamp() - active.startedAt
    const deltaX = point.x - active.startX
    const deltaY = point.y - active.startY
    const travelSq = distanceSquared(point.x, point.y, active.startX, active.startY)

    if (duration <= SWIPE_MAX_DURATION_MS && travelSq >= this.getSwipeThreshold()) {
      this.swipes.push(determineSwipeDirection(deltaX, deltaY))
      return
    }

    const lane = this.resolveLane(point.x)
    if (lane !== null) {
      this.taps.push(lane)
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return
    const swipe = KEYBOARD_SWIPE_MAP[event.code]
    const lane = KEYBOARD_LANE_MAP[event.code]
    if (swipe) {
      this.swipes.push(swipe)
      event.preventDefault()
      return
    }
    if (typeof lane === 'number') {
      this.taps.push(lane)
      event.preventDefault()
    }
  }

  bind(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('contextmenu', this.preventContextMenu)
    window.addEventListener('pointerup', this.handlePointerEnd)
    window.addEventListener('pointercancel', this.handlePointerEnd)
    window.addEventListener('keydown', this.handleKeyDown)
  }

  unbind(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('contextmenu', this.preventContextMenu)
    window.removeEventListener('pointerup', this.handlePointerEnd)
    window.removeEventListener('pointercancel', this.handlePointerEnd)
    window.removeEventListener('keydown', this.handleKeyDown)
    this.pointers.clear()
    this.taps.length = 0
    this.swipes.length = 0
  }

  consumeFrame(): InputFrame {
    const tapLane = this.taps.shift() ?? null
    const swipe = this.swipes.shift() ?? null
    return { tapLane, swipe }
  }
}
