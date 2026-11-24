import type { ApiResponse } from '../../types'
import type { AssessmentVideoCapabilitySources } from '../assessment-media/types'
import type { CognitivePresentationDefinitionV1, CognitiveSession } from '../cognitive/types'
import type { SituationalRunnerDefinition } from '../situational/types'
import type { CompositeScaleDefinition, WholeQuestionnaireFormSectionItem } from './types'

export interface WholeV2LockedCognitiveUnit {
  unitType: 'COGNITIVE'
  itemId: string
  randomSeed: string
  trials: unknown[]
  summaryMeta?: Record<string, unknown>
  lockedAt?: string
  payloadHash?: string
}

export interface WholeV2LockedSituationalUnit {
  unitType: 'SITUATIONAL'
  itemId: string
  responses: Record<string, unknown>
  researchEvents?: unknown[]
  totalTimeMs?: number
  lockedAt?: string
  payloadHash?: string
}

export type WholeV2LockedUnit = WholeV2LockedCognitiveUnit | WholeV2LockedSituationalUnit

export interface WholeV2CheckpointEnvelope {
  schemaVersion: 1
  drafts: Record<string, Record<string, unknown>>
  itemTimings?: Record<string, Record<string, unknown>>
  lockedUnits: Record<string, WholeV2LockedUnit>
}

export interface WholeV2CheckpointSnapshot {
  attemptId: string
  attemptEpoch: number
  publicationHash: string
  revision: number
  saveCount: number
  lockedSlotKeys: string[]
  expiresAt: string | null
  updatedAt: string | null
  envelope: WholeV2CheckpointEnvelope | null
}

export interface WholeV2CheckpointPutInput {
  expectedRevision: number
  attemptEpoch: number
  drafts: Record<string, Record<string, unknown>>
  itemTimings?: Record<string, Record<string, unknown>>
  lockUnit?: {
    slotKey: string
    unit:
      | Omit<WholeV2LockedCognitiveUnit, 'lockedAt' | 'payloadHash'>
      | Omit<WholeV2LockedSituationalUnit, 'lockedAt' | 'payloadHash'>
  }
}

export interface WholeV2PersistencePolicyView {
  draftCheckpointEnabled: boolean
  draftTtlHours: number | null
  localCognitiveEnabled: boolean
  localCognitiveTtlHours: number | null
}

export interface WholeV2Meta {
  executionMode: 'WHOLE_V2'
  attemptId: string
  attemptEpoch: number
  status?: string
  publicationHash: string
  slotSetHash: string
  templateHash: string
  activeSlotKeys?: string[] | null
  receiptOnly: boolean
  timingEnabled?: boolean
  persistencePolicy?: WholeV2PersistencePolicyView
  unitSeeds: Record<string, string> | null
  checkpoint: WholeV2CheckpointSnapshot
  existingReceipt?: WholeV2Receipt | null
}

export interface WholeV2ScaleTemplateUnit {
  slotKey: string
  unitType: 'SCALE'
  itemId: string
  scaleId: string
  title: string
  required: boolean
  position: number
  definitionHash: string
  instruction?: string | null
  definition: CompositeScaleDefinition
}

export interface WholeV2FormSectionTemplateUnit {
  slotKey: string
  unitType: 'FORM_SECTION'
  sectionId: string
  title: string
  description?: string | null
  required: boolean
  position: number
  contextSection: boolean
  definitionHash: string
  items: WholeQuestionnaireFormSectionItem[]
}

export interface WholeV2SituationalTemplateUnit {
  slotKey: string
  unitType: 'SITUATIONAL'
  itemId: string
  instrumentKey: string
  instrumentVersion: string
  title: string
  required: boolean
  position: number
  definitionHash: string
  compiledRuntimeHash: string
  scorerKey: string
  scoringVersion: string
  definition: SituationalRunnerDefinition
}

export interface WholeV2CognitiveTemplateUnit {
  slotKey: string
  unitType: 'COGNITIVE'
  itemId: string
  testType: string
  title: string
  required: boolean
  position: number
  definitionHash: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  protocolSignature: string
  protocol: NonNullable<CognitiveSession['protocol']>
  profile: 'experience' | 'standard' | 'research'
  config: Record<string, unknown>
  presentation?: CognitivePresentationDefinitionV1 | null
}

export type WholeV2TemplateUnit =
  | WholeV2ScaleTemplateUnit
  | WholeV2FormSectionTemplateUnit
  | WholeV2SituationalTemplateUnit
  | WholeV2CognitiveTemplateUnit

export interface WholeV2Template {
  schemaVersion: 2
  publicationHash: string
  slotSetHash: string
  compositeId: string
  title: string
  description?: string | null
  instruction?: string | null
  flowDefinition?: unknown | null
  units: WholeV2TemplateUnit[]
}

export type WholeV2UnitSubmitPayload =
  | {
      unitType: 'SCALE'
      definitionHash: string
      answers: Array<{
        itemCode: string
        responseValue: string | number
        responseTimeMs?: number
        answeredAt?: string
        changeCount?: number
      }>
      timings?: Record<string, unknown>
      deviceInputProvenance?: Record<string, unknown>
    }
  | {
      unitType: 'FORM_SECTION'
      definitionHash: string
      answers: Array<{
        formItemId: string
        value: unknown
        otherText?: string
      }>
    }
  | {
      unitType: 'SITUATIONAL'
      definitionHash: string
      responses: Record<string, unknown>
      researchEvents?: unknown[]
      totalTimeMs?: number
    }
  | {
      unitType: 'COGNITIVE'
      definitionHash: string
      randomSeed: string
      trials: unknown[]
      summaryMeta?: Record<string, unknown>
    }

export interface WholeV2SubmitInput {
  submissionId: string
  attemptEpoch: number
  publicationHash: string
  slotSetHash: string
  totalTimeMs?: number
  units: Record<string, WholeV2UnitSubmitPayload>
}

export interface WholeV2Receipt {
  status: 'COMPLETED'
  attemptId: string
  attemptEpoch: number
  submissionId: string
  payloadHash: string
  aggregateHash: string
  factsHash: string
  rawHash: string
  completedAt: string
  receiptOnly: boolean
  feedbackAvailable: boolean
  replayed: boolean
}

export interface WholeV2Client {
  loadMeta: () => Promise<ApiResponse<WholeV2Meta>>
  loadTemplate: (templateHash: string) => Promise<ApiResponse<WholeV2Template>>
  readCheckpoint: () => Promise<ApiResponse<WholeV2CheckpointSnapshot>>
  saveCheckpoint: (input: WholeV2CheckpointPutInput) => Promise<ApiResponse<WholeV2CheckpointSnapshot>>
  clearCheckpoint: () => Promise<ApiResponse<{ cleared: boolean }>>
  submitWhole: (input: WholeV2SubmitInput) => Promise<ApiResponse<WholeV2Receipt>>
  loadSlotImage: (slotKey: string, assetId: string) => Promise<Blob>
  issueSlotVideo: (slotKey: string, videoKey: string) => Promise<ApiResponse<AssessmentVideoCapabilitySources>>
}
