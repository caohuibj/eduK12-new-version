// Native generated rectangles only. Algorithm is versioned simon-fnv1a-mulberry32-v1.
export type SimonSide = 'left' | 'right'
export type SimonMapping = 'red-left' | 'blue-left'
export type SimonStimulus = { color: 'red' | 'blue'; stimulusSide: SimonSide; requiredSide: SimonSide; mapping: SimonMapping; isiMs: number }
const random = (seed: string) => {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0
  return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export const mappingForSeed = (seed: string): SimonMapping => random(seed + ':mapping')() < 0.5 ? 'red-left' : 'blue-left'
export const simonSequence = (seed: string, count: number, practice = false): SimonStimulus[] => {
  const next = random(seed + (practice ? ':practice' : ':test'))
  const mapping = mappingForSeed(seed)
  if (count % 4 !== 0) throw new Error('Simon count must balance four cells')
  const cells = Array.from({ length: count }, (_, i) => i % 4)
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]] }
  return cells.map(cell => {
    const color = cell < 2 ? 'red' : 'blue'
    const stimulusSide = cell % 2 === 0 ? 'left' : 'right'
    const requiredSide = (color === 'red') === (mapping === 'red-left') ? 'left' : 'right'
    return { color, stimulusSide, requiredSide, mapping, isiMs: 500 + Math.floor(next() * 500) }
  })
}
