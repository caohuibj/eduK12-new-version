import {
  COGNITIVE_TASK_PACKAGES,
  COGNITIVE_TASK_TYPES,
} from './generated/task-packages.generated'
import type { CognitiveTaskSemanticsV1 } from './task-package'

export {
  COGNITIVE_TASK_PACKAGES,
  COGNITIVE_TASK_TYPES,
}

export const requireCognitiveTaskSemantics = (testType: string): CognitiveTaskSemanticsV1 => {
  const taskPackage = COGNITIVE_TASK_PACKAGES.find((candidate) => candidate.testType === testType)
  if (!taskPackage) throw new Error(`No Cognitive task package for ${testType}`)
  return {
    protocolPhases: taskPackage.protocolPhases,
    qualityEffects: taskPackage.qualityEffects,
  }
}
