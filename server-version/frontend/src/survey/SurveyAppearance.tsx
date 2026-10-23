import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Clock3, Moon, Sun } from 'lucide-react'
import './survey-appearance.css'
import { surveyDaylight } from './survey-appearance-clock'

export type SurveyAppearanceMode = 'auto' | 'light' | 'dark'
const storageKey = 'survey.appearance'
function readMode(): SurveyAppearanceMode {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* Appearance still works when storage is unavailable. */ }
  return 'auto'
}
const AppearanceContext = createContext({ mode: 'auto' as SurveyAppearanceMode, theme: 'light', setMode: (_mode: SurveyAppearanceMode) => {} })

/** Scoped to the Survey application: never changes Training or assessment stimuli. */
export function SurveyAppearance({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<SurveyAppearanceMode>(readMode)
  const [daylight, setDaylight] = useState(() => surveyDaylight(new Date()))
  const theme = mode === 'auto' ? daylight : mode
  useEffect(() => {
    let timer: number
    const refresh = () => {
      const now = new Date()
      setDaylight(surveyDaylight(now))
      const boundary = new Date(now)
      boundary.setHours(now.getHours() < 7 ? 7 : now.getHours() < 19 ? 19 : 31, 0, 0, 0)
      window.clearTimeout(timer)
      timer = window.setTimeout(refresh, Math.min(60_000, Math.max(1, boundary.getTime() - now.getTime())))
    }
    const synchronize = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) updateMode(readMode())
    }
    // Recheck after sleeping, a clock/timezone change, and while the page stays open.
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('storage', synchronize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('storage', synchronize)
    }
  }, [])
  const setMode = (value: SurveyAppearanceMode) => {
    updateMode(value)
    setDaylight(surveyDaylight(new Date()))
    try { window.localStorage.setItem(storageKey, value) } catch { /* Session-only fallback. */ }
  }
  return <AppearanceContext.Provider value={{ mode, theme, setMode }}>
    <div className="survey-appearance-root" data-survey-theme={theme} data-survey-appearance={mode}>{children}</div>
  </AppearanceContext.Provider>
}

const appearanceModes = [
  { value: 'auto', label: '自动', Icon: Clock3 },
  { value: 'light', label: '浅色', Icon: Sun },
  { value: 'dark', label: '深色', Icon: Moon },
] as const

export function SurveyAppearanceControl() {
  const { mode, theme, setMode } = useContext(AppearanceContext)
  const index = appearanceModes.findIndex(item => item.value === mode)
  const { label, Icon } = appearanceModes[index]
  const next = appearanceModes[(index + 1) % appearanceModes.length]
  const description = mode === 'auto'
    ? `按本机时间，7:00–19:00 浅色，其余时间深色；当前${theme === 'dark' ? '深色' : '浅色'}`
    : '已记住此设备上的选择'
  return <div className="survey-appearance-control">
    <button type="button" className="survey-appearance-trigger"
      aria-label={`外观：${label}，点击切换为${next.label}`}
      title={`${description}。点击切换为${next.label}；自动 → 浅色 → 深色。`}
      onClick={() => setMode(next.value)}>
      <Icon size={18} aria-hidden="true"/><span>外观<span className="survey-appearance-mode" aria-live="polite"> · {label}</span></span>
    </button>
  </div>
}
