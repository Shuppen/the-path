import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LeadersBoard } from './LeadersBoard'

describe('LeadersBoard', () => {
  it('renders session and personal best values', () => {
    render(<LeadersBoard sessionBest={123} personalBest={4567} />)

    expect(screen.getByText('Лидеры')).toBeInTheDocument()
    expect(screen.getByText('Сессия')).toBeInTheDocument()
    expect(screen.getByText('000123')).toBeInTheDocument()
    expect(screen.getByText('Личный рекорд')).toBeInTheDocument()
    expect(screen.getByText('004567')).toBeInTheDocument()
    expect(screen.getByText(/Синхронизация с сервером/i)).toBeInTheDocument()
  })
})
