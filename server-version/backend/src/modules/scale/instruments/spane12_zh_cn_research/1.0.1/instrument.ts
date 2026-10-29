import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import source from './source.json'

// The retained 1.0.0 source owns the unchanged spane12.balance.v1:1.0.0
// descriptor in the existing generated registry. Reuse it; do not register twice.
export const SCALE_INSTRUMENT_SOURCE = source as unknown as ScaleInstrumentSourceV1
