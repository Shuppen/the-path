import '@testing-library/jest-dom/vitest'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

if (!('requestAnimationFrame' in globalThis)) {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number
  globalThis.cancelAnimationFrame = (handle: number): void => {
    clearTimeout(handle)
  }
}

const gradientStub = {
  addColorStop: () => {},
}

const canvasContextStub = {
  canvas: document.createElement('canvas'),
  clearRect: () => {},
  fillRect: () => {},
  createRadialGradient: () => gradientStub,
  beginPath: () => {},
  arc: () => {},
  fill: () => {},
  stroke: () => {},
  moveTo: () => {},
  lineTo: () => {},
  set fillStyle(value: string) {
    void value
  },
  get fillStyle() {
    return ''
  },
  set strokeStyle(value: string) {
    void value
  },
  get strokeStyle() {
    return ''
  },
  lineWidth: 1,
} satisfies Partial<CanvasRenderingContext2D>

const getContextStub = (
  ...args: Parameters<typeof HTMLCanvasElement.prototype.getContext>
): CanvasRenderingContext2D | null => {
  const [contextId] = args

  if (contextId === '2d') {
    return canvasContextStub as unknown as CanvasRenderingContext2D
  }

  return null
}

HTMLCanvasElement.prototype.getContext = getContextStub as typeof HTMLCanvasElement.prototype.getContext
