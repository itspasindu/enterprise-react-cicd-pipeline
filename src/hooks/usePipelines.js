import { useQuery } from 'react-query'
import api from '@utils/api'

function isSetupError(error) {
  return error?.response?.status === 503 && Boolean(error?.response?.data?.hint)
}

function isApiUnavailable(error) {
  const status = error?.response?.status
  return (
    status === 502 ||
    status === 504 ||
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ERR_NETWORK' ||
    error?.message === 'Network Error'
  )
}

export function getPipelineErrorMeta(error) {
  if (!error) return null
  if (isSetupError(error)) {
    return {
      type: 'setup',
      message: error.response.data.error || 'Pipeline monitor is not configured',
      hint: error.response.data.hint,
    }
  }
  if (isApiUnavailable(error)) {
    return {
      type: 'unavailable',
      message: 'The status service is temporarily unavailable',
      hint: 'Start the API with npm run api:dev (port 3001), then refresh. If it just restarted, wait a moment and try again.',
    }
  }
  return {
    type: 'error',
    message: error.response?.data?.message || error.response?.data?.error || error.message,
    hint: error.response?.data?.hint,
  }
}

function hasInProgress(runs = []) {
  return runs.some(run => {
    const status = (run.conclusion || run.status || '').toLowerCase()
    return status === 'in_progress' || status === 'queued' || status === 'pending'
  })
}

function liveInterval(data, idleMs = 45_000, activeMs = 10_000) {
  if (!data) return idleMs
  const runs = data.recentRuns || data.runs || []
  if (data.latestCi || data.latestCd) {
    return hasInProgress([data.latestCi, data.latestCd, ...runs].filter(Boolean))
      ? activeMs
      : idleMs
  }
  if (data.conclusion || data.status) {
    const status = (data.conclusion || data.status || '').toLowerCase()
    return status === 'in_progress' || status === 'queued' ? activeMs : idleMs
  }
  return hasInProgress(runs) ? activeMs : idleMs
}

export function usePipelineStatus() {
  return useQuery(
    ['pipelines', 'status'],
    async () => {
      const { data } = await api.get('/pipelines/status')
      return data
    },
    { retry: 2, retryDelay: 1500, staleTime: 60_000, refetchInterval: 60_000 }
  )
}

export function usePipelineOverview({ enabled = true } = {}) {
  return useQuery(
    ['pipelines', 'overview'],
    async () => {
      const { data } = await api.get('/pipelines/overview')
      return data
    },
    {
      enabled,
      retry: false,
      staleTime: 10_000,
      refetchInterval: data => liveInterval(data),
      refetchIntervalInBackground: false,
    }
  )
}

export function usePipelineRuns({ workflow, page = 1 } = {}) {
  return useQuery(
    ['pipelines', 'runs', workflow || 'all', page],
    async () => {
      const { data } = await api.get('/pipelines/runs', {
        params: { workflow: workflow || undefined, page, perPage: 20 },
      })
      return data
    },
    {
      retry: false,
      staleTime: 10_000,
      keepPreviousData: true,
      refetchInterval: data => liveInterval(data),
    }
  )
}

export function usePipelineRun(runId) {
  return useQuery(
    ['pipelines', 'run', runId],
    async () => {
      const { data } = await api.get(`/pipelines/runs/${runId}`)
      return data
    },
    {
      enabled: Boolean(runId),
      retry: false,
      staleTime: 8_000,
      refetchInterval: data => liveInterval(data, 30_000, 8_000),
    }
  )
}

export function usePipelineArtifacts(runId) {
  return useQuery(
    ['pipelines', 'artifacts', runId],
    async () => {
      const { data } = await api.get(`/pipelines/runs/${runId}/artifacts`)
      return data
    },
    { enabled: Boolean(runId), retry: false, staleTime: 30_000 }
  )
}

export function usePipelineFailures() {
  return useQuery(
    ['pipelines', 'failures'],
    async () => {
      const { data } = await api.get('/pipelines/failures')
      return data
    },
    { retry: false, staleTime: 30_000, refetchInterval: 60_000 }
  )
}

export function useStagingHealth() {
  return useQuery(
    ['pipelines', 'staging'],
    async () => {
      const { data } = await api.get('/pipelines/staging')
      return data
    },
    { retry: 1, staleTime: 15_000, refetchInterval: 30_000 }
  )
}

/** Aggregate recent artifacts from overview runs */
export function useRecentArtifacts(runs = []) {
  const runIds = runs.slice(0, 5).map(run => run.id)
  return useQuery(
    ['pipelines', 'recent-artifacts', ...runIds],
    async () => {
      const batches = await Promise.all(
        runIds.map(async id => {
          try {
            const { data } = await api.get(`/pipelines/runs/${id}/artifacts`)
            return (data.artifacts || []).map(artifact => ({ ...artifact, runId: id }))
          } catch {
            return []
          }
        })
      )
      return batches.flat()
    },
    {
      enabled: runIds.length > 0,
      retry: false,
      staleTime: 30_000,
    }
  )
}
