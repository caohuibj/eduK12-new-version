import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import source from './source.json'

/** Discovery only: no executable, authorization or scientific-review claim. */
export const SCALE_INSTRUMENT_SOURCE = source as unknown as ScaleInstrumentSourceV1
