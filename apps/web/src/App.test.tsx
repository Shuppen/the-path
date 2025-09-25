import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from './App'

describe('App', () => {
  it('renders home screen with CTA', () => {
    render(<App />)
    expect(screen.getByText('Играть')).toBeInTheDocument()
    expect(screen.getByText(/вертикальная ритм-аркада/i)).toBeInTheDocument()
  })

  it('navigates to song select screen', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /выбрать трек/i }))
    expect(await screen.findByText(/плейлист/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /назад/i })).toBeInTheDocument()
  })

  it('opens settings and returns home', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /настройки/i }))
    expect(await screen.findByText(/ограничение dpr/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /назад/i }))
    expect(await screen.findByText('Играть')).toBeInTheDocument()
  })
})
