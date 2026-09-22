import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '../src/components/pipeline/StatusBadge'
import SetupBanner from '../src/components/pipeline/SetupBanner'
import PipelineFlow from '../src/components/pipeline/PipelineFlow'
import { TEST_IDS } from '../src/config/app-contract'

describe('pipeline UI primitives', () => {
  it('renders status badges', () => {
    render(<StatusBadge status="success" />)
    expect(screen.getByText('Passed')).toBeInTheDocument()
  })

  it('renders setup banner with hint', () => {
    render(<SetupBanner message="Not configured" hint="Set GITHUB_TOKEN" />)
    expect(screen.getByTestId(TEST_IDS.pipelineSetupBanner)).toBeInTheDocument()
    expect(screen.getByText('Set GITHUB_TOKEN')).toBeInTheDocument()
  })

  it('renders pipeline flow nodes', () => {
    render(
      <PipelineFlow
        stages={[
          { key: 'full-stack-tests', name: 'Full-Stack Tests', conclusion: 'success', jobs: [] },
          { key: 'security-scan', name: 'Security Analysis', conclusion: 'in_progress', jobs: [] },
        ]}
      />
    )
    expect(screen.getByTestId('pipeline-flow')).toBeInTheDocument()
    expect(screen.getByText('Full-Stack Tests')).toBeInTheDocument()
    expect(screen.getByText('Security Analysis')).toBeInTheDocument()
  })
})
