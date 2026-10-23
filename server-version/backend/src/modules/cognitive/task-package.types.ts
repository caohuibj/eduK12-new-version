import type { RegistryEntry } from './cognitive.types'
import type { ProtocolDefinition, QualityDefinition, TaskDefinition } from './v2/types'

/** Logical execution projection; frontend and governance remain separate modules. */
export interface CognitiveTaskPackageV1 {
  schemaVersion: 1
  executionEntries: RegistryEntry<unknown, unknown>[]
}

/** Explicit task-owned adapter semantics. Never derived from flag spelling or evidence. */
export interface CognitiveExecutionSemanticsV1 {
  protocol: ProtocolDefinition
  qualityEffects: Record<string, QualityDefinition['effect']>
  metricCategories: Record<string, string>
  legacyStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
}

/** New protocols can supply authoritative v2 metrics without a fake legacy score. */
export interface NativeCognitiveTaskPackageV1 {
  schemaVersion: 1
  executionModel: 'NATIVE_V2'
  nativeDefinitions: TaskDefinition<unknown, unknown>[]
}
