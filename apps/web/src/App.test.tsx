import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders canvas with MVP copy', () => {
    render(<App />)
    expect(screen.getByRole('presentation')).toBeInTheDocument()
    expect(
      screen.getByText('Calibrate the route through rhythm-synced obstacles')
    ).toBeInTheDocument()
  })
})
