import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Moon, Palette, Sun, SunMoon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { isTrainingHost } from './context'
import { appearanceKey, appearanceTheme, nextAppearanceBoundary, parseAppearance, type TrainingAppearance } from './appearance'

import { Appearance, useTrainingAppearance } from './appearanceContext'

function read(key: string, enabled: boolean): TrainingAppearance {
  if (!enabled) return 'light'
  try { return parseAppearance(localStorage.getItem(key)) } catch { return 'light' }
}
export function TrainingAppearanceProvider({ children }: { children: ReactNode }) {
  const enabled = isTrainingHost()
  const { user } = useAuth()
  const key = appearanceKey(user?.id)
  const [choice, setChoice] = useState(() => ({ key, mode: read(key, enabled), storageError: false }))
  // A new account must never render the previous account's preference, even
  // during the frame before effects resubscribe to its storage key.
  const current = choice.key === key ? choice : { key, mode: read(key, enabled), storageError: false }
  const mode = enabled ? current.mode : 'light'
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled) return
    const update = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return
      if (event.key === key || event.key === null) setChoice({ key, mode: read(key, true), storageError: false })
    }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [enabled, key])
  useEffect(() => {
    if (!enabled || mode !== 'auto') return
    let timer: ReturnType<typeof setTimeout>
    const update = () => {
      clearTimeout(timer)
      const date = new Date(); setNow(date)
      timer = setTimeout(update, nextAppearanceBoundary(date))
    }
    update()
    // Resume and periodic clock checks also cover device timezone/clock changes.
    const clock = setInterval(update, 60_000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { clearTimeout(timer); clearInterval(clock); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [enabled, mode, key])
  const select = useCallback((value: TrainingAppearance) => {
    if (!enabled) return
    let storageError = false
    try { localStorage.setItem(key, value) } catch { storageError = true }
    setChoice({ key, mode: value, storageError }); setNow(new Date())
  }, [enabled, key])
  const value = useMemo(() => ({ enabled, mode, theme: appearanceTheme(mode, now), storageError: current.storageError, select }), [enabled, mode, now, current.storageError, select])
  return <Appearance.Provider value={value}>{children}</Appearance.Provider>
}
export default function TrainingAppearanceSettings() {
  const { enabled, mode, theme, storageError, select } = useTrainingAppearance()
  if (!enabled) return null
  return <section className="training-appearance-settings" aria-labelledby="training-appearance-title">
    <h2 id="training-appearance-title"><Palette size={19} aria-hidden="true" />外观</h2>
    <p>选择适合自己的阅读外观，在此浏览器为当前账户保存。</p>
    <fieldset><legend className="sr-only">选择 Training 外观</legend><div className="training-appearance-options">
      {([
        { value: 'light', label: '正常色', description: '暖白底色，清晰自然', Icon: Sun },
        { value: 'dark', label: '暗色', description: '月夜山水，安静专注', Icon: Moon },
        { value: 'auto', label: '昼夜自动', description: '白天正常色，夜间暗色', Icon: SunMoon },
      ] as const).map(({ value, label, description, Icon }) => <label key={value} className="training-appearance-option">
        <Icon size={22} aria-hidden="true" /><span><strong>{label}</strong><small>{description}</small></span>
        <input type="radio" name="training-appearance" value={value} checked={mode === value} onChange={() => select(value)} />
      </label>)}
    </div></fieldset>
    <p className="training-appearance-status" role="status">{mode === 'auto' ? `按本机时间，每天 07:00 切换正常色，19:00 切换暗色。当前为${theme === 'dark' ? '暗色' : '正常色'}。` : `当前使用${theme === 'dark' ? '暗色' : '正常色'}，选择后即时生效。`}</p>
    <p>认知测验的任务画面保留原始配色。</p>
    {storageError && <p className="training-appearance-warning" role="alert">外观已在当前页面生效，但浏览器未能保存。刷新后请重新选择。</p>}
  </section>
}
