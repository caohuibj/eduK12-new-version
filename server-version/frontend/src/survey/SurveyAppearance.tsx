import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Clock3, Moon, Sun } from 'lucide-react'
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

export function SurveyAppearanceControl() {
  const { mode, theme, setMode } = useContext(AppearanceContext)
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])
  const Icon = theme === 'dark' ? Moon : Sun
  return <div className="survey-appearance-control" ref={container}>
    <button type="button" ref={trigger} className="survey-appearance-trigger" aria-expanded={open}
      aria-controls={id} onClick={() => setOpen(!open)}><Icon size={18} aria-hidden="true"/><span>外观</span></button>
    {open && <section id={id} className="survey-appearance-popover" aria-label="外观设置">
      <strong>外观设置</strong><p>选择适合此刻的明暗。</p>
      <div role="group" aria-label="显示模式">{([
        ['auto', '自动', Clock3], ['light', '浅色', Sun], ['dark', '深色', Moon],
      ] as const).map(([value, label, ModeIcon]) => <button type="button" key={value}
        aria-pressed={mode === value} onClick={() => setMode(value)}>
        <ModeIcon size={20} aria-hidden="true"/><span>{label}</span>{mode === value && <Check size={14} aria-hidden="true"/>}
      </button>)}</div>
      <small>{mode === 'auto' ? `按本机时间自动切换，当前为${theme === 'dark' ? '深色' : '浅色'}。` : '已记住此设备上的选择。'}<br/>7:00–19:00 浅色，其余时间深色。</small>
    </section>}
  </div>
}
