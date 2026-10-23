import { useCallback, useEffect, useState } from 'react'

export type ProductAppearance = 'light' | 'dark' | 'auto'
export type ProductTheme = 'light' | 'dark'
export type AppearanceProduct = 'school' | 'teacher'

// Follows Training appearance at 80f02f4f, without its host or AuthContext dependency.
export function appearanceKey(product: AppearanceProduct, userId?: string): string {
  return `${product}:appearance:v1:${userId ? encodeURIComponent(userId) : 'guest'}`
}
export function parseAppearance(value: string | null): ProductAppearance {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto'
}
export function appearanceTheme(mode: ProductAppearance, now = new Date()): ProductTheme {
  return mode === 'auto' ? (now.getHours() >= 7 && now.getHours() < 19 ? 'light' : 'dark') : mode
}
export function nextAppearanceBoundary(now = new Date()): number {
  const next = new Date(now)
  if (now.getHours() < 7) next.setHours(7, 0, 0, 0)
  else if (now.getHours() < 19) next.setHours(19, 0, 0, 0)
  else { next.setDate(next.getDate() + 1); next.setHours(7, 0, 0, 0) }
  return Math.max(1, next.getTime() - now.getTime())
}
function read(key: string): ProductAppearance {
  try { return parseAppearance(localStorage.getItem(key)) } catch { return 'auto' }
}
export function useProductTheme(product: AppearanceProduct, userId?: string) {
  const key = appearanceKey(product, userId)
  const [choice, setChoice] = useState(() => ({ key, mode: read(key), storageError: false }))
  // Never render another account's preference while effects switch subscriptions.
  const current = choice.key === key ? choice : { key, mode: read(key), storageError: false }
  const { mode } = current
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = (event: StorageEvent) => {
      try { if (event.storageArea && event.storageArea !== localStorage) return } catch { return }
      if (event.key === key || event.key === null) setChoice({ key, mode: read(key), storageError: false })
    }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [key])
  useEffect(() => {
    if (mode !== 'auto') return
    let timer: ReturnType<typeof setTimeout>
    const update = () => {
      clearTimeout(timer)
      const date = new Date(); setNow(date)
      timer = setTimeout(update, nextAppearanceBoundary(date))
    }
    update()
    // Match Training's minute clock check for timezone/manual clock changes.
    const clock = setInterval(update, 60_000)
    window.addEventListener('focus', update)
    window.addEventListener('pageshow', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timer); clearInterval(clock)
      window.removeEventListener('focus', update)
      window.removeEventListener('pageshow', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [mode, key])
  const select = useCallback((value: ProductAppearance) => {
    let storageError = false
    try { localStorage.setItem(key, value) } catch { storageError = true }
    setChoice({ key, mode: value, storageError }); setNow(new Date())
  }, [key])
  return { mode, theme: appearanceTheme(mode, choice.key === key ? now : new Date()), storageError: current.storageError, select }
}
export type ProductAppearanceState = ReturnType<typeof useProductTheme>
