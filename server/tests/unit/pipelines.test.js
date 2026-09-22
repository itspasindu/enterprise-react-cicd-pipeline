import { describe, expect, it } from 'vitest'
import {
  mapJobToStageKey,
  summarizeJobsIntoStages,
  mapWorkflowRun,
  stageDisplayName,
} from '../../src/github/pipelines.js'

describe('pipeline stage mapping', () => {
  it('maps known job names to stage keys', () => {
    expect(mapJobToStageKey('Test Full Stack')).toBe('full-stack-tests')
    expect(mapJobToStageKey('Security Full Stack')).toBe('security-scan')
    expect(mapJobToStageKey('Package Release')).toBe('container-release')
    expect(mapJobToStageKey('Deploy Staging')).toBe('compose-deploy')
    expect(mapJobToStageKey('Roll Back Staging')).toBe('rollback')
    expect(mapJobToStageKey('Create Failure Ticket')).toBe('failure-ticket')
  })

  it('returns display names for stage keys', () => {
    expect(stageDisplayName('full-stack-tests')).toBe('Full-Stack Tests')
    expect(stageDisplayName('compose-deploy')).toBe('Compose Deployment')
  })

  it('summarizes jobs into pipeline stages', () => {
    const stages = summarizeJobsIntoStages([
      { id: 1, name: 'Test Full Stack', status: 'completed', conclusion: 'success', html_url: 'https://example.com/1' },
      { id: 2, name: 'Security Full Stack', status: 'completed', conclusion: 'failure', html_url: 'https://example.com/2' },
      { id: 3, name: 'Package Release', status: 'completed', conclusion: 'skipped', html_url: 'https://example.com/3' },
    ])

    const tests = stages.find(s => s.key === 'full-stack-tests')
    const security = stages.find(s => s.key === 'security-scan')
    const release = stages.find(s => s.key === 'container-release')
    const deploy = stages.find(s => s.key === 'compose-deploy')

    expect(tests.conclusion).toBe('success')
    expect(security.conclusion).toBe('failure')
    expect(release.conclusion).toBe('skipped')
    expect(deploy.conclusion).toBe('skipped')
  })

  it('maps workflow runs to ci/cd', () => {
    expect(
      mapWorkflowRun({
        id: 10,
        name: 'CI',
        path: '.github/workflows/ci.yml',
        status: 'completed',
        conclusion: 'success',
        head_sha: 'abcdef1234567890',
        head_branch: 'main',
        html_url: 'https://github.com/o/r/actions/runs/10',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:10:00Z',
        actor: { login: 'dev' },
      }).workflow
    ).toBe('ci')

    expect(
      mapWorkflowRun({
        id: 11,
        name: 'CD',
        path: '.github/workflows/cd.yml',
        status: 'in_progress',
        conclusion: null,
        head_sha: 'abcdef1234567890',
        head_branch: 'main',
        html_url: 'https://github.com/o/r/actions/runs/11',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:10:00Z',
        actor: { login: 'dev' },
      }).conclusion
    ).toBe('in_progress')
  })
})
