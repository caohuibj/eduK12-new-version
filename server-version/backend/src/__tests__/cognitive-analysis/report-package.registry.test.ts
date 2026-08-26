import { describe, expect, it } from 'vitest'
import {
  getReportPackageByResourceId,
  getReportPackageDefinition,
  listReportPackageDefinitions,
  reportPackageResourceId,
} from '../../modules/cognitive-analysis/report-package.registry'

describe('ReportPackageRegistry PR6B', () => {
  it('keeps the PR14 package resources versioned and required', () => {
    const gateMode = process.env.COGNITIVE_R2_GATE_MODE ?? 'pre-release'
    const candidatePackage = process.env.COGNITIVE_R2_GATE_CANDIDATE_PACKAGE ?? ''
    const packages = listReportPackageDefinitions()
    const expectedKeys = [
      'attention_stability_v1',
      'inhibitory_control_v1',
      'inhibitory_control_multisource_v1',
      'working_memory_v1',
      'executive_control_v1',
      'learning_reasoning_v1',
      'k12_core_profile_v1',
    ] as const
    const definitions = expectedKeys.map((key) => packages.find((item) => item.key === key))
    expect(definitions.every(Boolean)).toBe(true)
    for (const definition of definitions) {
      if (!definition) continue
      const expectedStatus = gateMode === 'promotion-candidate' && candidatePackage === `${definition.key}@1.0.0` ? 'PUBLISHED' : 'DRAFT'
      expect(definition.status).toBe(expectedStatus)
      if (expectedStatus === 'DRAFT') expect(definition.disabledReason).toBeTruthy()
      expect(definition.slots.every((slot) => slot.required)).toBe(true)
      expect(definition.reportDefinitionVersion).toBe('report-package-v1')
    }
    expect(packages.find((item) => item.key === 'inhibitory_control_multisource_v1')?.slots).toEqual([
      expect.objectContaining({
        key: 'gonogo',
        position: 0,
        testType: 'gonogo',
      }),
      expect.objectContaining({
        key: 'adexi_inhibition',
        position: 1,
        expectedScaleCode: 'adexi_v1',
        expectedDimensionCode: 'inhibition',
      }),
    ])
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
