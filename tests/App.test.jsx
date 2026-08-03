import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from 'react-query'
import App from '../src/App'

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
    expect(screen.getByText('EnterpriseApp')).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<App />, { wrapper: createWrapper() })
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
  })

  it('renders footer', () => {
    render(<App />, { wrapper: createWrapper() })
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument()
  })
})
