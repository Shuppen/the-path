import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import App from './App'

type MediaMatchController = {
  setMatches: (query: string, matches: boolean) => void
  restore: () => void
}

const setupMatchMedia = (initial: Record<string, boolean>): MediaMatchController => {
  type Listener = (event: MediaQueryListEvent) => void
  type MediaQueryListMock = MediaQueryList & { matches: boolean }
  type QueryState = { matches: boolean; mqls: Set<MediaQueryListMock> }

  const listeners = new Map<string, Set<Listener>>()
  const ensureListeners = (query: string): Set<Listener> => {
    let set = listeners.get(query)
    if (!set) {
      set = new Set<Listener>()
      listeners.set(query, set)
    }
    return set
  }

  const states = new Map<string, QueryState>()
  const ensureState = (query: string): QueryState => {
    let state = states.get(query)
    if (!state) {
      state = { matches: initial[query] ?? false, mqls: new Set() }
      states.set(query, state)
    }
    return state
  }

  const original = window.matchMedia
  const matchMedia = vi.fn().mockImplementation((query: string) => {
    const state = ensureState(query)
    const mql: MediaQueryListMock = {
      matches: state.matches,
      media: query,
      onchange: null,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change') {
          ensureListeners(query).add(listener as Listener)
        }
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change') {
          ensureListeners(query).delete(listener as Listener)
        }
      },
      addListener: (listener: Listener) => {
        ensureListeners(query).add(listener)
      },
      removeListener: (listener: Listener) => {
        ensureListeners(query).delete(listener)
      },
      dispatchEvent: (event: MediaQueryListEvent) => {
        ensureListeners(query).forEach((listener) => listener(event))
        return true
      },
    }
    state.mqls.add(mql)
    return mql
  })

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })

  return {
    setMatches: (query: string, matches: boolean) => {
      const state = ensureState(query)
      state.matches = matches
      const event = { matches, media: query } as MediaQueryListEvent
      state.mqls.forEach((mql) => {
        mql.matches = matches
        if (typeof mql.onchange === 'function') {
          mql.onchange(event)
        }
      })
      const listenersForQuery = ensureListeners(query)
      listenersForQuery.forEach((listener) => listener(event))
    },
    restore: () => {
      if (original) {
        window.matchMedia = original
      } else {
        delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia
      }
    },
  }
}

describe('App', () => {
  it('renders canvas with MVP copy', () => {
    render(<App />)
    expect(screen.getByRole('presentation')).toBeInTheDocument()
    expect(screen.getByText('Calibrate the route through rhythm-synced obstacles')).toBeInTheDocument()
  })

  it('disables UI transitions when reduced motion is preferred', () => {
    const media = setupMatchMedia({
      '(prefers-reduced-motion: reduce)': true,
      '(min-width: 768px)': false,
    })

    try {
      render(<App />)
      expect(screen.getByTestId('audio-progress-fill')).toHaveStyle({ transition: 'none' })
      screen.getAllByTestId('recorder-progress-fill').forEach((node) => {
        expect(node).toHaveStyle({ transition: 'none' })
      })
      screen.getAllByTestId('status-marquee-content').forEach((node) => {
        expect(node).toHaveStyle({ animation: 'none' })
      })
    } finally {
      media.restore()
    }
  })

  it('renders desktop layout when md breakpoint matches', () => {
    const media = setupMatchMedia({
      '(prefers-reduced-motion: reduce)': false,
      '(min-width: 768px)': true,
    })

    try {
      render(<App />)
      expect(screen.queryByLabelText(/open controls/i)).not.toBeInTheDocument()
      expect(screen.queryByTestId('bottom-sheet')).not.toBeInTheDocument()
      expect(screen.queryByText('Procedural key')).not.toBeInTheDocument()
    } finally {
      media.restore()
    }
  })

  it('switches to mobile layout when the breakpoint shrinks', async () => {
    const media = setupMatchMedia({
      '(prefers-reduced-motion: reduce)': false,
      '(min-width: 768px)': true,
    })

    try {
      render(<App />)
      expect(screen.queryByLabelText(/open controls/i)).not.toBeInTheDocument()

      act(() => {
        media.setMatches('(min-width: 768px)', false)
      })

      await waitFor(() => expect(screen.getByLabelText(/open controls/i)).toBeInTheDocument())
    } finally {
      media.restore()
    }
  })

  it('opens the bottom sheet via the FAB on mobile', async () => {
    const media = setupMatchMedia({
      '(prefers-reduced-motion: reduce)': false,
      '(min-width: 768px)': false,
    })

    try {
      render(<App />)
      const sheet = screen.getByTestId('bottom-sheet')
      const overlay = screen.getByTestId('bottom-sheet-overlay')
      expect(sheet).toHaveAttribute('aria-hidden', 'true')
      expect(overlay).toHaveStyle({ pointerEvents: 'none' })

      const user = userEvent.setup()
      await user.click(screen.getByLabelText(/open controls/i))

      expect(sheet).toHaveAttribute('aria-hidden', 'false')
      expect(overlay).toHaveStyle({ pointerEvents: 'auto' })
    } finally {
      media.restore()
    }
  })
})
