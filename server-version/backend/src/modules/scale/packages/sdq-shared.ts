/**
 * Shared SDQ scoring constants from published Goodman materials.
 * Provenance: sdqinfo.org scoring instructions; Project TEACH NY SDQ_4scoring reprint;
 * newer 4-band UK community cut-points for ages 4–17 (parent vs teacher differ).
 * Bands are UK community descriptive references — NOT mainland CN clinical norms.
 */

/** 1-based SDQ item numbers that are reverse-scored (Not True=2, Certainly True=0). */
export const SDQ_REVERSE_ITEM_NUMBERS = [7, 11, 14, 21, 25] as const

export const SDQ_SUBSCALE_ITEMS = {
  emotional: [3, 8, 13, 16, 24],
  conduct: [5, 7, 12, 18, 22],
  hyperactivity: [2, 10, 15, 21, 25],
  peer: [6, 11, 14, 19, 23],
  prosocial: [1, 4, 9, 17, 20],
} as const

export type SdqSubscaleKey = keyof typeof SDQ_SUBSCALE_ITEMS

/** Parent-completed 4–17 newer 4-band (UK community). Total difficulties. */
export const SDQ_PARENT_4BAND_TOTAL = {
  close_to_average: { min: 0, max: 13 },
  slightly_raised: { min: 14, max: 16 },
  high: { min: 17, max: 19 },
  very_high: { min: 20, max: 40 },
} as const

/** Teacher-completed 4–17 newer 4-band (UK community). Total difficulties. */
export const SDQ_TEACHER_4BAND_TOTAL = {
  close_to_average: { min: 0, max: 11 },
  slightly_raised: { min: 12, max: 15 },
  high: { min: 16, max: 18 },
  very_high: { min: 19, max: 40 },
} as const

export const SDQ_RESPONSE_VALUES = {
  not_true: 'not_true',
  somewhat_true: 'somewhat_true',
  certainly_true: 'certainly_true',
} as const

export const makeSdqItemCode = (index: number): string => `SDQ-${String(index).padStart(2, '0')}`

export const sdqItemCodesFor = (numbers: readonly number[]): string[] => (
  numbers.map((n) => makeSdqItemCode(n))
)

export const describeUkFourBand = (informant: 'parent' | 'teacher'): string => {
  const bands = informant === 'parent' ? SDQ_PARENT_4BAND_TOTAL : SDQ_TEACHER_4BAND_TOTAL
  return (
    `Goodman newer 4-band UK community cut-points for ${informant}-completed SDQ ages 4–17 `
    + `(close to average ${bands.close_to_average.min}–${bands.close_to_average.max}; `
    + `slightly raised ${bands.slightly_raised.min}–${bands.slightly_raised.max}; `
    + `high ${bands.high.min}–${bands.high.max}; `
    + `very high ${bands.very_high.min}–${bands.very_high.max}). `
    + `Cited descriptively only — not validated mainland CN clinical norms; not a diagnosis.`
  )
}
