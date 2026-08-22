export type ScaleLabel = { value: number; label: string }

export const clampScalePoints = (points?: number | null): number => {
  const value = Number(points)
  if (!Number.isInteger(value)) return 5
  return Math.min(10, Math.max(2, value))
}

/** 按点数补齐连续 1..N，保留教师已写文字；缺档用「选项k」。 */
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

export const scaleLabelsError = (
  points?: number | null,
  labels?: Array<{ value?: number; label?: string }> | null,
): string | null => {
  const size = clampScalePoints(points)
  if (!Array.isArray(labels) || labels.length !== size) {
    return `档位必须连续覆盖 1 到 ${size}，不能跳过`
  }
  const seen = new Set<number>()
  for (const item of labels) {
    const value = Number(item.value)
    const text = String(item.label ?? '').trim()
    if (!Number.isInteger(value) || value < 1 || value > size || seen.has(value)) {
      return `档位必须连续覆盖 1 到 ${size}，不能跳过`
    }
    if (!text) {
      return '每一档都需要填写文字'
    }
    seen.add(value)
  }
  if (seen.size !== size) {
    return `档位必须连续覆盖 1 到 ${size}，不能跳过`
  }
  return null
}

export const normalizeScaleConfig = (config?: {
  points?: number
  labels?: Array<{ value?: number; label?: string }>
  randomizeItems?: boolean
  randomizeOptions?: boolean
} | null) => {
  if (!config) {
    const points = 5
    return { points, labels: completeScaleLabels(points, null) }
  }
  const points = clampScalePoints(config.points)
  return {
    ...config,
    points,
    labels: completeScaleLabels(points, config.labels),
  }
}
