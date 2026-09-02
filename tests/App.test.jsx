import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from 'react-query'
import App from '../src/App'
import { NAV_LINKS, TEST_IDS } from '../src/config/app-contract'

const createWrapper = () => {
  const queryClient = new QueryClient()
  const TestProviders = ({ children }) => (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  )

  TestProviders.displayName = 'TestProviders'
  return TestProviders
}

describe('App', () => {
  it('renders the navbar', () => {
    render(<App />, { wrapper: createWrapper() })
    expect(screen.getByTestId(TEST_IDS.mainNav)).toBeInTheDocument()
  })

  it('renders navigation links from app contract', () => {
    render(<App />, { wrapper: createWrapper() })
    for (const { label } of NAV_LINKS) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
    }
  })

  it('navigates between routes without Playwright', async () => {
    const user = userEvent.setup()
    render(<App />, { wrapper: createWrapper() })

    await user.click(screen.getAllByRole('link', { name: 'About' })[0])
    expect(await screen.findByTestId(TEST_IDS.aboutPage)).toBeInTheDocument()

    await user.click(screen.getAllByRole('link', { name: 'Contact' })[0])
    expect(await screen.findByTestId(TEST_IDS.contactPage)).toBeInTheDocument()
  })

  it('renders footer', () => {
    render(<App />, { wrapper: createWrapper() })
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument()
  })
})
