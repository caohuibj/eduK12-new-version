import {
  validateScaleDefinition,
  type DefinitionIssue,
  type ScaleDefinitionV2,
} from './scale-definition'
import { getScaleCustomScorerKeys } from './scale-scoring'

export interface ScaleDefinitionProductReadinessResult {
  valid: boolean
  definition?: ScaleDefinitionV2
  issues: DefinitionIssue[]
}

/**
 * Product publication for an editable Scale asks only whether the declared
 * definition can run through the current product workflow. Source/license
 * provenance and scientific evidence are intentionally outside this gate.
 */
export const validateScaleProductDefinition = (
  value: unknown,
  instrumentClass: 'STANDARD' | 'CUSTOM_DESCRIPTIVE',
): ScaleDefinitionProductReadinessResult => {
  const validation = validateScaleDefinition(value, {
    instrumentClass,
    forPublish: false,
    scorerKeys: getScaleCustomScorerKeys(),
  })
  if (!validation.definition) return { valid: false, issues: validation.issues }

  const issues = [...validation.issues]
  if (validation.definition.display.randomizeItems) {
    issues.push({
      path: 'display.randomizeItems',
      message: '当前 Runner 不支持题目随机化',
      severity: 'error',
    })
  }
  validation.definition.items.forEach((item, index) => {
    if (item.randomizeOptions) {
      issues.push({
        path: `items.${index}.randomizeOptions`,
        message: '当前 Runner 不支持选项随机化',
        severity: 'error',
      })
    }
  })

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    definition: validation.definition,
    issues,
  }
}
