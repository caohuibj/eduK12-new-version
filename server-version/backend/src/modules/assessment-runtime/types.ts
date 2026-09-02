import type { CANONICAL_JSON_SHA256_V1 } from './canonical'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export type RuntimeInstrumentType = 'SCALE' | 'COGNITIVE' | 'BUNDLE'

export interface CompiledMetricDefinitionV1 {
  key: string
  label: string
  unit?: string
  valueType: string
  direction?: string
  role?: string
}

export interface CompiledQualityDefinitionV1 {
  key: string
  label: string
  description: string
}

export interface AggregateProjectionV1 {
  allowedMetricKeys: string[]
  allowedFactKeys: string[]
  allowedReferenceClassifications: string[]
}

export interface ReferenceBindingDefinitionV1 {
  required: boolean
  selections: Array<{
    referenceKey: string
    referenceVersion: string
    scoreKey?: string
    referenceKind?: string
    profileKey?: string
  }>
}

export interface RuntimeCapabilitiesV1 {
  standalone: boolean
  embedded: boolean
  aggregateEligible: boolean
  collectionFacts: boolean
  supported: boolean
}

export interface CompiledInstrumentRuntimeV1 {
  schemaVersion: 1
  compilerVersion: string
  instrumentType: RuntimeInstrumentType
  instrumentKey: string
  instrumentVersion: string
  sourceDefinitionHash: string
  compiledRuntimeHash: string
  hashScheme: typeof CANONICAL_JSON_SHA256_V1
  scorerKey: string | null
  scorerVersion: string
  metricDefinitions: Record<string, CompiledMetricDefinitionV1>
  qualityDefinitions: Record<string, CompiledQualityDefinitionV1>
  reportDefinition: JsonObject
  aggregateProjection: AggregateProjectionV1
  referenceBindingDefinition: ReferenceBindingDefinitionV1
  runtimeCapabilities: RuntimeCapabilitiesV1
}

export interface ReferenceBindingSnapshot {
  referenceKey: string
  referenceVersion: string
  referenceHash: string
  scoreKey?: string
  referenceKind?: string
  profileKey?: string
}
