import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders canvas with MVP copy', () => {
    render(<App />)
    expect(screen.getByRole('presentation')).toBeInTheDocument()
    expect(
      screen.getByText('Calibrate the route through rhythm-synced obstacles')
    ).toBeInTheDocument()
  })

  it('disables UI transitions when reduced motion is preferred', () => {
    const originalMatchMedia = window.matchMedia
    const mockMatchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn().mockReturnValue(true),
      onchange: null,
    }))

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: mockMatchMedia,
    })

    try {
      render(<App />)
      expect(screen.getByTestId('audio-progress-fill')).toHaveStyle({ transition: 'none' })
      expect(screen.getByTestId('recorder-progress-fill')).toHaveStyle({ transition: 'none' })
    } finally {
      if (originalMatchMedia) {
        window.matchMedia = originalMatchMedia
      } else {
        delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia
      }
    }
  })
})
