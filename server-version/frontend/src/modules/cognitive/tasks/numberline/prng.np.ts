// Numeric NP settings from Siegler & Opfer (2003), Method, p.238.
// Facts only; no original task images or workbooks are bundled.
export const NUMBERLINE_NP_STIMULUS_VERSION = 'siegler-opfer-2003-np-numeric-v1.0.0'
export const NUMBERLINE_NP_SETS = {
  100: { A: [2, 4, 6, 18, 42, 71], B: [2, 3, 6, 25, 67, 86] },
  1000: { A: [4, 6, 18, 71, 230, 780], B: [2, 6, 25, 86, 390, 810] },
} as const

export const buildNumberlineNpTargets = (seed: string, lineMax: 100 | 1000, set: 'A' | 'B'): Array<{ targetNumber: number }> => {
  // Task-owned deterministic Fisher-Yates; the same mirror is used on both ends.
  let state = 2166136261
  for (const c of `${seed}:numberline-np-v1:${lineMax}:${set}`) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
  const values: number[] = [...NUMBERLINE_NP_SETS[lineMax][set]]
  for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]] }
  return values.map(targetNumber => ({ targetNumber }))
}
