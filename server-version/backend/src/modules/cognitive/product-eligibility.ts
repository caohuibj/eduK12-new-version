import { config } from '../../config'
import { BAD_REQUEST } from './cognitive.errors'

/** The server capability controls NEW authoring/admission, never historical readers. */
export const isCognitiveNewAdmissionEnabled = (): boolean => config.cognitiveModuleEnabled
export const assertCognitiveNewAdmissionEnabled = (): void => {
  if (!isCognitiveNewAdmissionEnabled()) throw BAD_REQUEST('认知模块暂不可用，尚未准入的任务请在重新开启后继续')
}

/** Framework fixtures remain registered for exact-version historical readers. */
export const isCognitiveProductEligible = (testType: string): boolean =>
  isCognitiveNewAdmissionEnabled() && (testType !== 'fake' || (process.env.NODE_ENV === 'test' && process.env.COGNITIVE_TEST_FIXTURES_ENABLED === 'true'))

export const assertCognitiveProductEligible = (testType: string): void => {
  assertCognitiveNewAdmissionEnabled()
  if (!isCognitiveProductEligible(testType)) throw BAD_REQUEST('框架测试任务不能用于正式创建、发布或新投放')
}
