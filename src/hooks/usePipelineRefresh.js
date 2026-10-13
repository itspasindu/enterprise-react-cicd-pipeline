import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react'

const STORAGE_KEY = 'pipeline-refresh-settings'

const INTERVAL_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '10000', label: '10s' },
  { value: '30000', label: '30s' },
  { value: '60000', label: '60s' },
]

function readStoredSettings() {
  if (typeof window === 'undefined') {
    return { paused: false, interval: 'auto' }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { paused: false, interval: 'auto' }
    const parsed = JSON.parse(raw)
    return {
      paused: Boolean(parsed.paused),
      interval: INTERVAL_OPTIONS.some(opt => opt.value === parsed.interval)
        ? parsed.interval
        : 'auto',
    }
  } catch {
    return { paused: false, interval: 'auto' }
  }
}

const PipelineRefreshContext = createContext({
  paused: false,
  interval: 'auto',
  intervalOptions: INTERVAL_OPTIONS,
  setPaused: () => {},
  setRefreshInterval: () => {},
  togglePaused: () => {},
})

export function PipelineRefreshProvider({ children }) {
  const [settings, setSettings] = useState(readStoredSettings)

  const persist = useCallback(next => {
    setSettings(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore quota / private mode
    }
  }, [])

  const value = useMemo(
    () => ({
      paused: settings.paused,
      interval: settings.interval,
      intervalOptions: INTERVAL_OPTIONS,
      setPaused: paused => persist({ ...settings, paused: Boolean(paused) }),
      setRefreshInterval: interval =>
        persist({
          ...settings,
          interval: INTERVAL_OPTIONS.some(opt => opt.value === interval) ? interval : 'auto',
        }),
      togglePaused: () => persist({ ...settings, paused: !settings.paused }),
    }),
    [persist, settings]
  )

  return createElement(PipelineRefreshContext.Provider, { value }, children)
}

export function usePipelineRefresh() {
  return useContext(PipelineRefreshContext)
}

export { INTERVAL_OPTIONS }
