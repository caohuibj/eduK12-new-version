import { canonicalHash } from './canonical'
import { createFrozenActiveSlotSet, type FrozenActiveSlotSetV1, type FrozenActiveSlotV1 } from './slot-set'
import type { JsonObject } from './types'

type ScaleSlotInput = {
  questionnaireScaleId?: string
  compositeItemId?: string
  code: string
  instrumentVersion: string
  sourceDefinitionHash: string
  compiledRuntimeHash?: string
}

type CognitiveSlotInput = {
  compositeItemId: string
  testType: string
  instrumentVersion: string
  sourceDefinitionHash: string
  compiledRuntimeHash: string
}

type FormSlotInput = {
  sectionId: string
  definitionHash: string
}

const scaleSlot = (input: ScaleSlotInput): FrozenActiveSlotV1 => {
  const slotKey = input.questionnaireScaleId
    ? `scale:${input.questionnaireScaleId}`
    : `scale:${input.compositeItemId}`
  return {
    slotKey,
    unitType: 'SCALE',
    required: true,
    sourceDefinitionIdentity: {
      key: input.code,
      version: input.instrumentVersion,
      hash: input.sourceDefinitionHash,
    },
    sourceBinding: {
      ...(input.questionnaireScaleId ? { questionnaireScaleId: input.questionnaireScaleId } : {}),
      ...(input.compositeItemId ? { compositeItemId: input.compositeItemId } : {}),
      scaleCode: input.code,
      ...(input.compiledRuntimeHash ? { compiledRuntimeHash: input.compiledRuntimeHash } : {}),
    },
  }
}

const cognitiveSlot = (input: CognitiveSlotInput): FrozenActiveSlotV1 => ({
  slotKey: `cognitive:${input.compositeItemId}`,
  unitType: 'COGNITIVE',
  required: true,
  sourceDefinitionIdentity: {
    key: input.testType,
    version: input.instrumentVersion,
    hash: input.sourceDefinitionHash,
  },
  sourceBinding: {
    compositeItemId: input.compositeItemId,
    testType: input.testType,
    compiledRuntimeHash: input.compiledRuntimeHash,
  },
})

const compareSlotKeys = (left: FrozenActiveSlotV1, right: FrozenActiveSlotV1): number => {
  if (left.slotKey === right.slotKey) return 0
  return left.slotKey < right.slotKey ? -1 : 1
}

const formSlot = (input: FormSlotInput): FrozenActiveSlotV1 => ({
  slotKey: `form-section:${input.sectionId}`,
  unitType: 'FORM_SECTION',
  required: true,
  sourceDefinitionIdentity: {
    key: input.sectionId,
    version: 'FORM_SECTION_V1',
    hash: input.definitionHash,
  },
  sourceBinding: { sectionId: input.sectionId },
})

export const freezeQuestionnaireActiveSlotSet = (input: {
  attemptEpoch: number
  scales: ScaleSlotInput[]
  formSections: FormSlotInput[]
}): FrozenActiveSlotSetV1 => createFrozenActiveSlotSet({
  schemaVersion: 1,
  runtimeGeneration: 'UNIFIED_V1',
  attemptEpoch: input.attemptEpoch,
  slots: [
    ...input.scales.map(scaleSlot),
    ...input.formSections.map(formSlot),
  ].sort(compareSlotKeys),
})

export const freezeCompositeActiveSlotSet = (input: {
  attemptEpoch: number
  scales: ScaleSlotInput[]
  cognitive: CognitiveSlotInput[]
  formSections: FormSlotInput[]
}): FrozenActiveSlotSetV1 => createFrozenActiveSlotSet({
  schemaVersion: 1,
  runtimeGeneration: 'UNIFIED_V1',
  attemptEpoch: input.attemptEpoch,
  slots: [
    ...input.scales.map(scaleSlot),
    ...input.cognitive.map(cognitiveSlot),
    ...input.formSections.map(formSlot),
  ].sort(compareSlotKeys),
})

export const sourceDefinitionHashForScale = (definition: unknown): string => canonicalHash(definition)

export const formSectionIdentityHash = (definition: unknown): string => canonicalHash(definition)

export const asJsonObject = (value: Record<string, unknown>): JsonObject => value as JsonObject
