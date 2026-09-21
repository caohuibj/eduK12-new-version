import type { RegistryEntry } from './cognitive.types'
import type { ProtocolDefinition, QualityDefinition } from './v2/types'

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
