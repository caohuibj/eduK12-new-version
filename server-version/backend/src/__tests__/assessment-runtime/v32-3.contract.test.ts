import { describe, expect, it, vi } from 'vitest'
import {
  createFrozenUnitAdmission,
  decryptFrozenUnitAdmission,
  encryptFrozenUnitAdmission,
  hashFrozenUnitAdmission,
  parseFrozenUnitAdmission,
} from '../../modules/assessment-runtime/admission-snapshot'
import { loadFrozenReferenceSets, referenceSetHash } from '../../modules/assessment-runtime/reference-binding'
import { validateReferenceSetDefinition } from '../../modules/assessment-reference/reference'
import { assertAdmissionParentBinding } from '../../modules/scale/scale-admission.service'

process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || 'a'.repeat(64)

const scale = {
  id: 'scale-1',
  code: 'v32-3.demo',
  name: 'V32-3 demo',
  instrumentVersion: '1.0.0',
}

const frozenAt = new Date('2026-09-02T00:00:00.000Z')

describe('V32-3 frozen unit admission contract', () => {
  it('round-trips a standalone admission with a stable hash', () => {
    const snapshot = createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale,
      principal: { userId: 'user-1' },
      frozenAt,
    })

    expect(snapshot.runtimeGeneration).toBe('UNIFIED_V1')
    expect(snapshot.parent).toBeNull()
    expect(snapshot.requiresContext).toBe(false)
    expect(snapshot.governance).toEqual({ status: 'READY', holdReason: null })
    expect(snapshot.snapshotHash).toBe(hashFrozenUnitAdmission(snapshot))
    expect(parseFrozenUnitAdmission(snapshot)).toEqual(snapshot)
    expect(decryptFrozenUnitAdmission(encryptFrozenUnitAdmission(snapshot), snapshot.snapshotHash)).toEqual(snapshot)
  })

  it('freezes one parent slot identity instead of a slot set', () => {
    const snapshot = createFrozenUnitAdmission({
      attemptEpoch: 2,
      scale,
      principal: { userId: 'user-1', questionnaireSessionId: 'session-1' },
      parent: {
        kind: 'questionnaire',
        parentId: 'parent-1',
        slotKey: 'scale:binding-1',
        sourceDefinitionHash: 'b'.repeat(64),
        compiledRuntimeHash: 'c'.repeat(64),
      },
      requiresContext: true,
      contextSnapshotHash: 'context-hash',
      contextValues: { gradeLevel: '3' },
      frozenAt,
    })

    expect(snapshot.parent).toMatchObject({
      kind: 'questionnaire',
      slotKey: 'scale:binding-1',
      compiledRuntimeHash: 'c'.repeat(64),
    })
    expect(snapshot).not.toHaveProperty('slots')
    expect(encryptFrozenUnitAdmission(snapshot)).not.toContain('scale:binding-2')
  })

  it('rejects required context without a snapshot hash and HOLD without a reason', () => {
    expect(() => parseFrozenUnitAdmission(createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale,
      requiresContext: true,
      contextSnapshotHash: null,
      frozenAt,
    }))).toThrow(/requires context/)
    expect(() => createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale,
      governance: { status: 'HOLD', holdReason: null },
      frozenAt,
    })).toThrow(/holdReason/)
  })

  it('rejects a stored hash mismatch on decrypt', () => {
    const snapshot = createFrozenUnitAdmission({ attemptEpoch: 1, scale, frozenAt })
    expect(() => decryptFrozenUnitAdmission(encryptFrozenUnitAdmission(snapshot), 'd'.repeat(64))).toThrow(/stored hash/)
  })

  it('binds frozen parent kind and parentId to the child foreign keys', () => {
    const questionnaire = createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale,
      parent: {
        kind: 'questionnaire',
        parentId: 'parent-1',
        slotKey: 'scale:binding-1',
        sourceDefinitionHash: 'b'.repeat(64),
        compiledRuntimeHash: 'c'.repeat(64),
      },
      frozenAt,
    })
    expect(() => assertAdmissionParentBinding({
      questionnaireAssessmentId: 'parent-1',
      compositeAttemptId: null,
    }, questionnaire)).not.toThrow()
    expect(() => assertAdmissionParentBinding({
      questionnaireAssessmentId: 'parent-2',
      compositeAttemptId: null,
    }, questionnaire)).toThrow(/上级绑定不匹配/)
    expect(() => assertAdmissionParentBinding({
      questionnaireAssessmentId: null,
      compositeAttemptId: 'composite-1',
    }, questionnaire)).toThrow(/上级绑定不匹配/)

    const standalone = createFrozenUnitAdmission({ attemptEpoch: 1, scale, frozenAt })
    expect(() => assertAdmissionParentBinding({
      questionnaireAssessmentId: null,
      compositeAttemptId: null,
    }, standalone)).not.toThrow()
    expect(() => assertAdmissionParentBinding({
      questionnaireAssessmentId: 'parent-1',
      compositeAttemptId: null,
    }, standalone)).toThrow(/上级绑定不匹配/)
  })

  it('keeps Scale hashes stable when Cognitive/Form identities are absent', () => {
    const snapshot = createFrozenUnitAdmission({ attemptEpoch: 1, scale, frozenAt })
    expect(snapshot).not.toHaveProperty('cognitive')
    expect(snapshot).not.toHaveProperty('formSection')
    expect(snapshot.scale).toEqual(scale)
  })

  it('round-trips Cognitive and Form identities without a Scale field', () => {
    const cognitive = createFrozenUnitAdmission({
      attemptEpoch: 1,
      cognitive: {
        testType: 'gonogo',
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        configHash: 'a'.repeat(64),
      },
      principal: { userId: 'user-1' },
      parent: {
        kind: 'composite',
        parentId: 'attempt-1',
        slotKey: 'cognitive:item-1',
        sourceDefinitionHash: 'b'.repeat(64),
        compiledRuntimeHash: 'c'.repeat(64),
      },
      frozenAt,
    })
    expect(cognitive.scale).toBeUndefined()
    expect(cognitive.cognitive?.testType).toBe('gonogo')
    expect(parseFrozenUnitAdmission(cognitive)).toEqual(cognitive)

    const form = createFrozenUnitAdmission({
      attemptEpoch: 1,
      formSection: {
        id: 'section-1',
        identityHash: 'form-hash',
        kind: 'questionnaire',
        definition: { id: 'section-1', title: '背景', items: [] },
      },
      principal: { userId: 'user-1' },
      parent: {
        kind: 'questionnaire',
        parentId: 'parent-1',
        slotKey: 'form-section:section-1',
        sourceDefinitionHash: 'b'.repeat(64),
        compiledRuntimeHash: 'd'.repeat(64),
      },
      frozenAt,
    })
    expect(form.scale).toBeUndefined()
    expect(form.formSection?.kind).toBe('questionnaire')
    expect(parseFrozenUnitAdmission(form)).toEqual(form)
  })

  it('rejects admissions that are missing or combining instrument identities', () => {
    expect(() => createFrozenUnitAdmission({ attemptEpoch: 1, frozenAt })).toThrow(/exactly one instrument identity/)
    expect(() => createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale,
      cognitive: {
        testType: 'gonogo',
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        configHash: 'a'.repeat(64),
      },
      frozenAt,
    })).toThrow(/exactly one instrument identity/)
  })
})

describe('V32-3 frozen reference batch load', () => {
  const definitionFor = (referenceVersion: string) => {
    const validation = validateReferenceSetDefinition({
      schemaVersion: 1,
      instrumentType: 'scale',
      instrumentKey: 'v32-3.demo',
      referenceVersion,
      status: 'ACTIVE',
      entries: [{
        scoreKey: 'total',
        referenceKind: 'normative_distribution',
        evidenceLevel: 'literature_beta',
        provenanceType: 'literature_reported',
        instrumentVersion: '1.0.0',
        scoringVersion: '2.0.0',
        population: { description: 'fixture' },
        source: { citation: 'V32-3', publicationYear: 2026, sampleSize: 10 },
        statistics: { mean: 50, sd: 10 },
      }],
    })
    if (!validation.definition) throw new Error('V32-3 reference fixture is invalid')
    return validation.definition
  }

  it('loads distinct frozen versions in one findMany', async () => {
    const first = definitionFor('ref-1')
    const second = definitionFor('ref-2')
    const findMany = vi.fn().mockResolvedValue([
      { instrumentType: 'SCALE', instrumentKey: 'v32-3.demo', referenceVersion: 'ref-1', status: 'ACTIVE', definition: first },
      { instrumentType: 'SCALE', instrumentKey: 'v32-3.demo', referenceVersion: 'ref-2', status: 'ACTIVE', definition: second },
    ])

    const loaded = await loadFrozenReferenceSets({ assessmentReferenceSet: { findMany } }, {
      instrumentType: 'SCALE',
      instrumentKey: 'v32-3.demo',
      bindings: [
        { referenceKey: 'v32-3.demo', referenceVersion: 'ref-1', referenceHash: referenceSetHash(first) },
        { referenceKey: 'v32-3.demo', referenceVersion: 'ref-2', referenceHash: referenceSetHash(second) },
        { referenceKey: 'v32-3.demo', referenceVersion: 'ref-1', referenceHash: referenceSetHash(first) },
      ],
    })

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: {
        instrumentType: 'SCALE',
        instrumentKey: 'v32-3.demo',
        referenceVersion: { in: ['ref-1', 'ref-2'] },
      },
    })
    expect(loaded).toHaveLength(3)
    expect(loaded[0].referenceVersion).toBe('ref-1')
    expect(loaded[1].referenceVersion).toBe('ref-2')
  })
})
