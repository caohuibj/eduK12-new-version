import { executionSemantics as legacy } from './semantics.v1'
import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'
export const executionSemantics: CognitiveExecutionSemanticsV1[] = [legacy[0], {
  ...legacy[0], legacyStatus: 'DRAFT',
  protocol: { ...legacy[0].protocol, key: 'proofread/1.1.0/1.1.0', version: '1.1.0', randomizationAlgorithmVersion: 'proofread-sequence-v1.1.0' },
  qualityEffects: { ...legacy[0].qualityEffects, noResponses: 'invalid' },
  metricCategories: { ...legacy[0].metricCategories, answeredCount: 'verbal_reasoning', correctCount: 'verbal_reasoning' },
}]
