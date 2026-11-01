import type { CognitiveExecutionSemanticsV1 } from '../../task-package.types'
import { executionSemantics } from './semantics'

export const semanticsV11: CognitiveExecutionSemanticsV1 = {
  ...structuredClone(executionSemantics[0]),
  protocol: { ...executionSemantics[0].protocol, key: 'auditorynback/1.1.0/1.1.0', version: '1.1.0', randomizationAlgorithmVersion: 'auditorynback-fixed-count-v1.1.0' },
  legacyStatus: 'DRAFT',
}
