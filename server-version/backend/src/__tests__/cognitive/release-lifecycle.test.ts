import { describe, expect, it } from 'vitest'
import { assertConfigStatusTransition } from '../../modules/cognitive/config-immutability'
import { assertTaskCanPublish, assertTaskReadyForRelease } from '../../modules/cognitive/v2/publication-gate'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'

describe('Cognitive product release single-truth invariants', () => {
  it('keeps lifecycle transitions one-way', () => {
    expect(() => assertConfigStatusTransition('DRAFT', 'PUBLISHED')).not.toThrow()
    expect(() => assertConfigStatusTransition('PUBLISHED', 'RETIRED')).not.toThrow()
    expect(() => assertConfigStatusTransition('PUBLISHED', 'DRAFT')).toThrow()
    expect(() => assertConfigStatusTransition('RETIRED', 'PUBLISHED')).toThrow()
    expect(() => assertConfigStatusTransition('RETIRED', 'DRAFT')).toThrow()
  })

  it('does not let deprecated TaskDefinition publication metadata gate readiness', () => {
    const definition = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')
    if (!definition) throw new Error('reaction v1.1 definition missing')

    const compatibilityDraft = {
      ...definition,
      publication: { ...definition.publication, status: 'DRAFT' as const },
    }
    const compatibilityRetired = {
      ...definition,
      publication: { ...definition.publication, status: 'RETIRED' as const },
    }

    expect(() => assertTaskReadyForRelease(compatibilityDraft)).not.toThrow()
    expect(() => assertTaskCanPublish(compatibilityRetired)).not.toThrow()
  })

  it('keeps registry compatibility metadata explicitly non-authoritative', () => {
    const definition = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')
    if (!definition) throw new Error('reaction v1.1 definition missing')
    expect(definition.publication.evidenceNote).toContain('DEPRECATED')
    expect(definition.publication.evidenceNote).toContain('CognitiveTestConfig.status')
  })
})
