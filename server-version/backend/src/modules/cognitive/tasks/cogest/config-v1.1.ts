import { cogestConfigSchema } from '../../schemas/cogest.config'
import { COGEST_STIMULUS_SET_VERSION } from './bank-v1.1'
export const cogestConfigV11Schema = cogestConfigSchema.refine(c => c.stimulusSetVersion === COGEST_STIMULUS_SET_VERSION && c.totalTrials <= 36 && c.validRtFloorMs < c.timeoutMs, {message: '1.1.0 requires its frozen bank, at most 36 distinct items, and RT floor below timeout'})
