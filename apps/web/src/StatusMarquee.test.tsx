import { act, render, screen, waitFor } from '@testing-library/react'

import { StatusMarquee } from './App'

const originalResizeObserver = globalThis.ResizeObserver

const createResizeObserverMock = () => {
  type ObserverRecord = {
    observer: ResizeObserverMock
    callback: ResizeObserverCallback
  }

  const observedElements = new Map<Element, ObserverRecord>()

  class ResizeObserverMock {
    callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    disconnect(): void {
      for (const [element, record] of observedElements.entries()) {
        if (record.observer === this) {
          observedElements.delete(element)
        }
      }
    }

    observe(target: Element): void {
      observedElements.set(target, {
        observer: this,
        callback: this.callback,
      })
    }

    unobserve(target: Element): void {
      observedElements.delete(target)
    }
  }

  const triggerResize = (target: Element) => {
    const record = observedElements.get(target)

    if (!record) {
      throw new Error('No observer registered for the provided element')
    }

    const entry = { target } as ResizeObserverEntry
    record.callback([entry], record.observer as unknown as ResizeObserver)
  }

  return { ResizeObserverMock, triggerResize }
}

describe('StatusMarquee', () => {
  let triggerResize: (target: Element) => void

  beforeEach(() => {
    const { ResizeObserverMock, triggerResize: trigger } = createResizeObserverMock()
    triggerResize = trigger
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver
  })

  it('keeps the marquee static when content fits the container', async () => {
    render(<StatusMarquee message="Short status" prefersReducedMotion={false} />)

    const marquee = screen.getByTestId('status-marquee-content')

    Object.defineProperty(marquee, 'clientWidth', {
      configurable: true,
      get: () => 200,
    })

    Object.defineProperty(marquee, 'scrollWidth', {
      configurable: true,
      get: () => 200,
    })

    act(() => {
      triggerResize(marquee)
    })

    await waitFor(() => {
      expect(marquee).toHaveStyle({ animation: 'none' })
    })
  })

  it('enables marquee animation when the content overflows', async () => {
    render(<StatusMarquee message="Long status message that should overflow" prefersReducedMotion={false} />)

    const marquee = screen.getByTestId('status-marquee-content')

    Object.defineProperty(marquee, 'clientWidth', {
      configurable: true,
      get: () => 200,
    })

    Object.defineProperty(marquee, 'scrollWidth', {
      configurable: true,
      get: () => 400,
    })

    act(() => {
      triggerResize(marquee)
    })

    await waitFor(() => {
      expect(marquee).toHaveStyle({ animation: 'status-marquee 20s linear infinite' })
    })
  })

  it('disables animation when reduced motion is preferred', async () => {
    const message = 'Overflowing status message that would otherwise animate'
    render(<StatusMarquee message={message} prefersReducedMotion />)

    const marquee = screen.getByTestId('status-marquee-content')

    Object.defineProperty(marquee, 'clientWidth', {
      configurable: true,
      get: () => 200,
    })

    Object.defineProperty(marquee, 'scrollWidth', {
      configurable: true,
      get: () => 400,
    })

    act(() => {
      triggerResize(marquee)
    })

    await waitFor(() => {
      expect(marquee).toHaveStyle({ animation: 'none' })
    })

    expect(screen.getAllByText(message)).toHaveLength(1)
  })
})
