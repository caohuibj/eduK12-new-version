import { BAD_REQUEST } from './cognitive.errors'

/** Framework fixtures remain registered for exact-version historical readers. */
export const isCognitiveProductEligible = (testType: string): boolean =>
  testType !== 'fake' || (process.env.NODE_ENV === 'test' && process.env.COGNITIVE_TEST_FIXTURES_ENABLED === 'true')

export const assertCognitiveProductEligible = (testType: string): void => {
  if (!isCognitiveProductEligible(testType)) throw BAD_REQUEST('框架测试任务不能用于正式创建、发布或新投放')
}
