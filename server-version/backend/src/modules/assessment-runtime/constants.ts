export const RUNTIME_GENERATION_LEGACY = 'LEGACY' as const
export const RUNTIME_GENERATION_UNIFIED_V1 = 'UNIFIED_V1' as const

export type RuntimeGeneration =
  | typeof RUNTIME_GENERATION_LEGACY
  | typeof RUNTIME_GENERATION_UNIFIED_V1

export const isUnifiedRuntimeGeneration = (value: unknown): value is typeof RUNTIME_GENERATION_UNIFIED_V1 => (
  value === RUNTIME_GENERATION_UNIFIED_V1
)

export const runtimeGenerationOf = (value: unknown): RuntimeGeneration => (
  isUnifiedRuntimeGeneration(value) ? RUNTIME_GENERATION_UNIFIED_V1 : RUNTIME_GENERATION_LEGACY
)
