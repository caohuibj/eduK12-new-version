export type TrainingAppearance = 'light' | 'dark' | 'auto'
export type TrainingTheme = 'light' | 'dark'

export function appearanceKey(userId?: string): string {
  return 'training:appearance:v1:' + (userId ? encodeURIComponent(userId) : 'guest')
}
export function parseAppearance(value: string | null): TrainingAppearance {
  return value === 'dark' || value === 'auto' ? value : 'light'
}
export function appearanceTheme(mode: TrainingAppearance, now = new Date()): TrainingTheme {
  return mode === 'auto' ? (now.getHours() >= 7 && now.getHours() < 19 ? 'light' : 'dark') : mode
}
/** Local calendar boundaries retain the device's timezone and DST rules. */
export function nextAppearanceBoundary(now = new Date()): number {
  const next = new Date(now)
  if (now.getHours() < 7) next.setHours(7, 0, 0, 0)
  else if (now.getHours() < 19) next.setHours(19, 0, 0, 0)
  else { next.setDate(next.getDate() + 1); next.setHours(7, 0, 0, 0) }
  return Math.max(1, next.getTime() - now.getTime())
}
