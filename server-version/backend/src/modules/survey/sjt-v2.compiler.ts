import { compileSjtV2 } from '../assessment-core/sjt/compiler'
import { SurveyDraftError, type SjtDraftV2 } from './builder.definition'
import { SjtDraftError } from '../assessment-core/sjt/definition'
import { canonicalHash } from '../assessment-runtime/canonical'
export const SURVEY_SJT_V2_COMPILER_VERSION='survey-sjt-fixed-v2.1'
/** Compatibility boundary: retain the original Survey envelope, digest and error class. */
export function compileSurveySjtV2(instrumentKey:string,display:SjtDraftV2) {
 try { return compileSjtV2(instrumentKey,display,{
  compilerVersion:SURVEY_SJT_V2_COMPILER_VERSION,physicalPrefix:'survey_q_',scoringPrefix:'survey-sjt-v2-',
  reportVersion:'survey-sjt-private-v2',metricChannelKey:'survey_response',
  packageKey:'research-'+canonicalHash(instrumentKey).slice(0,24),instrumentVersion:'0.2.0',
 }) } catch(error) {
  if(error instanceof SjtDraftError)throw new SurveyDraftError(error.issues)
  throw error
 }
}
