import { describe, expect, it } from 'vitest'
import {
  getReportPackageByResourceId,
  getReportPackageDefinition,
  listReportPackageDefinitions,
  reportPackageResourceId,
} from '../../modules/cognitive-analysis/report-package.registry'

describe('ReportPackageRegistry PR6B', () => {
  it('registers the six built-in cognitive-only packages as disabled drafts', () => {
    const packages = listReportPackageDefinitions()
    expect(packages).toHaveLength(6)
    expect(packages.map((item) => item.key)).toEqual([
      'attention_stability_v1',
      'inhibitory_control_v1',
      'working_memory_v1',
      'executive_control_v1',
      'learning_reasoning_v1',
      'k12_core_profile_v1',
    ])
    for (const definition of packages) {
      expect(definition.status).toBe('DRAFT')
      expect(definition.disabledReason).toBeTruthy()
      expect(definition.slots.every((slot) => slot.required)).toBe(true)
      expect(definition.reportDefinitionVersion).toBe('report-package-v1')
    }
  })

  it('resolves exact key/version resource ids and returns defensive copies', () => {
    const resourceId = reportPackageResourceId('attention_stability_v1', '1.0.0')
    const first = getReportPackageByResourceId(resourceId)
    expect(first?.key).toBe('attention_stability_v1')
    expect(getReportPackageDefinition('attention_stability_v1', '9.9.9')).toBeUndefined()
    if (!first) throw new Error('expected built-in package')
    first.slots[0].label = 'mutated'
    expect(getReportPackageByResourceId(resourceId)?.slots[0].label).not.toBe('mutated')
  })
})
