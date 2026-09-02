import { describe, expect, it } from 'vitest'
import { createFrozenActiveSlotSet, type FrozenActiveSlotV1 } from '../../modules/assessment-runtime/slot-set'
import {
  buildAggregateInputHash,
  evaluateCompleteness,
} from '../../modules/assessment-runtime/unified-aggregate'

const hash = 'a'.repeat(64)

const slots: FrozenActiveSlotV1[] = [
  {
    slotKey: 'scale:scale-1',
    unitType: 'SCALE',
    required: true,
    sourceDefinitionIdentity: { key: 'scale-1', version: '2.0.0', hash },
    sourceBinding: { questionnaireScaleId: 'scale-1', compiledRuntimeHash: hash },
  },
  {
    slotKey: 'form-section:section-1',
    unitType: 'FORM_SECTION',
    required: true,
    sourceDefinitionIdentity: { key: 'section-1', version: 'FORM_SECTION_V1', hash },
    sourceBinding: { sectionId: 'section-1' },
  },
]

const completedScale = {
  id: 'snapshot-scale',
  slotKey: 'scale:scale-1',
  attemptEpoch: 1,
  unitType: 'SCALE' as const,
  terminalState: 'COMPLETED' as const,
  payloadKind: 'UNIT_RESULT' as const,
  sourceType: 'ASSESSMENT',
  sourceAttemptId: 'assessment-1',
}

const completedForm = {
  id: 'snapshot-form',
  slotKey: 'form-section:section-1',
  attemptEpoch: 1,
  unitType: 'FORM_SECTION' as const,
  terminalState: 'COMPLETED' as const,
  payloadKind: 'COLLECTION_FACTS' as const,
  sourceType: 'QUESTIONNAIRE_FORM_SECTION',
  sourceAttemptId: 'section-attempt-1',
}

describe('V32-2 closed aggregate input', () => {
  it('computes readiness and progress from frozen slots and headers only', () => {
    expect(evaluateCompleteness({ slots, snapshots: [], attemptEpoch: 1 })).toMatchObject({
      ready: false,
      requiredSlotCount: 2,
      completedSlotCount: 0,
      missingSlotKeys: ['scale:scale-1', 'form-section:section-1'],
      progress: 0,
    })

    expect(evaluateCompleteness({ slots, snapshots: [completedScale], attemptEpoch: 1 })).toMatchObject({
      ready: false,
      completedSlotCount: 1,
      missingSlotKeys: ['form-section:section-1'],
      invalidSlotKeys: [],
      progress: 50,
    })

    expect(evaluateCompleteness({ slots, snapshots: [completedForm, completedScale], attemptEpoch: 1 })).toMatchObject({
      ready: true,
      completedSlotCount: 2,
      missingSlotKeys: [],
      invalidSlotKeys: [],
      progress: 100,
    })
  })

  it('rejects duplicate, foreign, stale, and mismatched snapshot headers', () => {
    const mismatched = { ...completedScale, unitType: 'COGNITIVE' as const }
    const duplicate = { ...completedScale, id: 'snapshot-scale-duplicate' }
    const foreign = { ...completedScale, id: 'snapshot-foreign', slotKey: 'scale:other' }
    const stale = { ...completedScale, id: 'snapshot-stale', attemptEpoch: 0 }

    expect(evaluateCompleteness({ slots, snapshots: [mismatched], attemptEpoch: 1 }).invalidSlotKeys).toEqual(['scale:scale-1'])
    expect(evaluateCompleteness({ slots, snapshots: [completedScale, duplicate], attemptEpoch: 1 }).invalidSlotKeys).toEqual(['scale:scale-1'])
    expect(evaluateCompleteness({ slots, snapshots: [foreign], attemptEpoch: 1 }).invalidSlotKeys).toEqual(['scale:other'])
    expect(evaluateCompleteness({ slots, snapshots: [stale], attemptEpoch: 1 }).invalidSlotKeys).toEqual(['scale:scale-1'])
    expect(evaluateCompleteness({ slots, snapshots: [stale], attemptEpoch: 1 }).missingSlotKeys).toEqual(['form-section:section-1'])
  })

  it('produces a deterministic aggregate identity independent of input order', () => {
    const frozen = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots })
    const first = buildAggregateInputHash({
      attemptEpoch: 1,
      contextHash: 'context-a',
      compiledBundleRuntimeHash: 'bundle-a',
      entries: [
        { slotKey: completedForm.slotKey, terminalState: completedForm.terminalState, payloadKind: completedForm.payloadKind, collectionFactsHash: 'facts-a', collectionIdentity: { sectionKey: 'section-1', itemKeys: ['item-1'] } },
        { slotKey: completedScale.slotKey, terminalState: completedScale.terminalState, payloadKind: completedScale.payloadKind, resultHash: 'result-a' },
      ],
    })
    const second = buildAggregateInputHash({
      attemptEpoch: frozen.attemptEpoch,
      contextHash: 'context-a',
      compiledBundleRuntimeHash: 'bundle-a',
      entries: [
        { slotKey: completedScale.slotKey, terminalState: completedScale.terminalState, payloadKind: completedScale.payloadKind, resultHash: 'result-a' },
        { slotKey: completedForm.slotKey, terminalState: completedForm.terminalState, payloadKind: completedForm.payloadKind, collectionFactsHash: 'facts-a', collectionIdentity: { sectionKey: 'section-1', itemKeys: ['item-1'] } },
      ],
    })
    expect(first).toBe(second)
    expect(buildAggregateInputHash({
      attemptEpoch: 1,
      contextHash: 'context-b',
      compiledBundleRuntimeHash: 'bundle-a',
      entries: [
        { slotKey: completedScale.slotKey, terminalState: completedScale.terminalState, payloadKind: completedScale.payloadKind, resultHash: 'result-a' },
        { slotKey: completedForm.slotKey, terminalState: completedForm.terminalState, payloadKind: completedForm.payloadKind, collectionFactsHash: 'facts-a', collectionIdentity: { sectionKey: 'section-1', itemKeys: ['item-1'] } },
      ],
    })).not.toBe(first)
  })
})
