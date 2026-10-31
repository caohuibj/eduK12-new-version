import { seriescompleteConfigSchema } from '../../schemas/seriescomplete.config'
import { SERIESCOMPLETE_STIMULUS_SET_VERSION } from './bank-v1.1'
export const seriescompleteConfigV11Schema = seriescompleteConfigSchema.refine(c => c.stimulusSetVersion === SERIESCOMPLETE_STIMULUS_SET_VERSION && c.totalTrials <= 36 && c.validRtFloorMs < c.timeoutMs, {message: '1.1.0 requires its frozen bank, at most 36 distinct items, and RT floor below timeout'})
