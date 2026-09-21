export type SituationalPathClass = 'INSTRUMENT_OWNED' | 'GENERATED' | 'SHARED_CORE'
const root = 'server-version/backend/src/modules/situational/'
export const classifySituationalPath = (path: string): SituationalPathClass => {
  if (path.includes('..') || path.includes('\\')) return 'SHARED_CORE'
  if (new RegExp(`^${root}instruments/[a-z][a-z0-9]*(?:-[a-z0-9]+)*/(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)/(instrument|publication|scientific)\\.json$`).test(path)) return 'INSTRUMENT_OWNED'
  if (path.startsWith(root + 'instruments/') && /\/(tests|assets)\//.test(path) && !/\.(?:ts|js|cjs|mjs|tsx|jsx)$/.test(path)) return 'INSTRUMENT_OWNED'
  if (path === root + 'onboarding/instruments.generated.ts') return 'GENERATED'
  return 'SHARED_CORE'
}
