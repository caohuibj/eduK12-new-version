import { cogestConfigSchema } from '../../schemas/cogest.config'
import { COGEST_STIMULUS_SET_VERSION, COGEST_BANK } from './bank-v1.1'
export const cogestConfigV11Schema = cogestConfigSchema.refine(c => c.stimulusSetVersion === COGEST_STIMULUS_SET_VERSION && c.totalTrials <= COGEST_BANK.length && c.validRtFloorMs < c.timeoutMs, {message: '1.1.0 requires its frozen bank, enough frozen candidate items for the requested protocol, and RT floor below timeout'})
