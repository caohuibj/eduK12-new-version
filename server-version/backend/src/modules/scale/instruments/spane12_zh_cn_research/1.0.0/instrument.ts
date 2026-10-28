import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import sourceJson from './source.json'
import { SPANE_SCORER_KEY, spane12BalanceScorer } from '../../../packages/spane12-balance-scorer'

const base = sourceJson as unknown as ScaleInstrumentSourceV1
/** The executable registry registers this versioned scorer before validating golden vectors. */
export const SCALE_INSTRUMENT_SOURCE: ScaleInstrumentSourceV1 = {
  ...base,
  executable: base.executable ? {
    ...base.executable,
    scorerPlugins: [{ key: SPANE_SCORER_KEY, version: '1.0.0', scorer: spane12BalanceScorer }],
  } : undefined,
}
