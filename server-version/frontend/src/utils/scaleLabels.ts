export type ScaleLabel = { value: number; label: string }

export const clampScalePoints = (points?: number | null): number => {
  const value = Number(points)
  if (!Number.isInteger(value)) return 5
  return Math.min(10, Math.max(2, value))
}

export const completeScaleLabels = (
  points?: number | null,
  labels?: Array<{ value?: number; label?: string }> | null,
): ScaleLabel[] => {
  const size = clampScalePoints(points)
  const byValue = new Map<number, string>()
  for (const item of labels || []) {
    const value = Number(item.value)
    if (!Number.isInteger(value) || value < 1 || value > size) continue
    const text = String(item.label ?? '').trim()
    if (text) byValue.set(value, text)
  }
  return Array.from({ length: size }, (_, index) => {
    const value = index + 1
    return { value, label: byValue.get(value) || `选项${value}` }
  })
}

export const resolveScaleOptions = (
  config?: { points?: number; labels?: ScaleLabel[] } | null,
  itemOptions?: Array<{ value: number; label: string }> | null,
): ScaleLabel[] => {
  if (Array.isArray(itemOptions) && itemOptions.length > 0) {
    return completeScaleLabels(itemOptions.length, itemOptions)
  }
  return completeScaleLabels(config?.points, config?.labels)
}
