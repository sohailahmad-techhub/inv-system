import { render, screen } from '@testing-library/react'
import Home from '../page'

describe('Home', () => {
  it('renders a heading', () => {
    render(<Home />)

    const deployLink = screen.getByText(/Deploy Now/i)

    expect(deployLink).toBeInTheDocument()
  })
})
