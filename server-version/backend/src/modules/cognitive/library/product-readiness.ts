import { compileCognitiveRuntime } from '../../assessment-runtime/compiler'
import {
  productNotReady,
  productReady,
  type ProductReadinessDecisionV1,
  type ProductReadinessIssueV1,
} from '../../assessment-governance/product-readiness'
import { validateTaskDefinition } from '../v2/publication-gate'
import type { TaskDefinition } from '../v2/types'

/**
 * Backend executable readiness for one exact Cognitive task definition.
 * Frontend runner parity is intentionally checked by a cross-tree CI audit,
 * because backend runtime code must never import frontend registries.
 */
export const evaluateCognitiveProductReadiness = (
  definition: TaskDefinition<unknown, unknown>,
): ProductReadinessDecisionV1 => {
  const blockers: ProductReadinessIssueV1[] = validateTaskDefinition(definition)
    .filter((candidate) => candidate.severity === 'error')
    .map((candidate) => ({
      stage: candidate.path.startsWith('report.')
        ? 'RESULT'
        : candidate.path.startsWith('finalSubmission')
          ? 'FINAL'
          : candidate.path.startsWith('scorer') || candidate.path.startsWith('metrics.') || candidate.path.startsWith('quality.')
            ? 'SCORING'
            : 'DEFINITION',
      code: 'COGNITIVE_TASK_INVALID',
      message: `${candidate.path}: ${candidate.message}`,
    }))

  if (blockers.length === 0) {
    try {
      const runtime = compileCognitiveRuntime({ definition })
      if (!runtime.runtimeCapabilities.supported) {
        blockers.push({
          stage: 'RUNTIME_COMPILE',
          code: 'COGNITIVE_RUNTIME_UNSUPPORTED',
          message: 'compiled Cognitive runtime does not declare supported=true',
        })
      }
    } catch (error) {
      blockers.push({
        stage: 'RUNTIME_COMPILE',
        code: 'COGNITIVE_RUNTIME_COMPILE_FAILED',
        message: error instanceof Error ? error.message : 'Cognitive runtime compile failed',
      })
    }
  }

  return blockers.length === 0 ? productReady() : productNotReady(blockers)
}
