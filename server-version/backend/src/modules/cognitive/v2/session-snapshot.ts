import { z } from 'zod'
import { computeConfigSnapshotHash, computeProtocolSignature, assertProtocolSignature } from './canonical'
import type { ProtocolDefinition, SessionConfigSnapshot, TaskDefinition } from './types'

const protocolPhaseSchema = z.object({
  key: z.enum(['test', 'learning', 'delayed']),
  persists: z.boolean(),
  required: z.boolean(),
}).strict()

export const protocolDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  key: z.string().min(1),
  version: z.string().min(1),
  clock: z.literal('performance'),
  randomizationAlgorithmVersion: z.string().min(1),
  trialEnvelopeVersion: z.literal(1),
  phases: z.array(protocolPhaseSchema).min(1),
  measurementCriticalConfigPaths: z.array(z.string().min(1)).min(1),
}).strict()

export const sessionConfigSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  frozenAt: z.string().datetime({ offset: true }),
  testType: z.string().min(1),
  configVersion: z.string().min(1),
  engineVersion: z.string().min(1),
  scoringVersion: z.string().min(1),
  config: z.unknown(),
  configHash: z.string().regex(/^[0-9a-f]{64}$/),
  protocol: protocolDefinitionSchema,
  protocolSignature: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

export const createSessionConfigSnapshot = <TConfig, TTrial>(input: {
  definition: TaskDefinition<TConfig, TTrial>
  configVersion: string
  config: unknown
  frozenAt?: Date
}): SessionConfigSnapshot<TConfig> => {
  const validatedConfig = input.definition.configSchema.parse(input.config)
  const frozenAt = input.frozenAt ?? new Date()
  if (Number.isNaN(frozenAt.getTime())) throw new Error('Invalid session snapshot frozenAt')
  const snapshot: SessionConfigSnapshot<TConfig> = {
    schemaVersion: 1,
    frozenAt: frozenAt.toISOString(),
    testType: input.definition.testType,
    configVersion: input.configVersion,
    engineVersion: input.definition.engineVersion,
    scoringVersion: input.definition.scoringVersion,
    config: validatedConfig,
    configHash: computeConfigSnapshotHash(validatedConfig),
    protocol: input.definition.protocol,
    protocolSignature: computeProtocolSignature(input.definition.protocol),
  }
  return parseSessionConfigSnapshot(snapshot)
}

export const parseSessionConfigSnapshot = <TConfig = unknown>(value: unknown): SessionConfigSnapshot<TConfig> => {
  const parsed = sessionConfigSnapshotSchema.parse(value) as SessionConfigSnapshot<TConfig>
  if (computeConfigSnapshotHash(parsed.config) !== parsed.configHash) {
    throw new Error('config snapshot hash mismatch')
  }
  assertProtocolSignature(parsed)
  return parsed
}

export const tryParseSessionConfigSnapshot = <TConfig = unknown>(value: unknown): SessionConfigSnapshot<TConfig> | null => {
  const parsed = sessionConfigSnapshotSchema.safeParse(value)
  if (!parsed.success) return null
  try {
    return parseSessionConfigSnapshot<TConfig>(parsed.data)
  } catch {
    return null
  }
}

export const isSessionConfigSnapshot = (value: unknown): value is SessionConfigSnapshot => (
  tryParseSessionConfigSnapshot(value) !== null
)

const looksLikeSessionConfigSnapshot = (value: unknown): boolean => (
  Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.prototype.hasOwnProperty.call(value, 'protocol')
      || Object.prototype.hasOwnProperty.call(value, 'protocolSignature')),
  )
)

export const sessionConfigFromStoredValue = <TConfig = unknown>(value: unknown): {
  config: TConfig
  snapshot: SessionConfigSnapshot<TConfig> | null
} => {
  // A legacy session stores the parsed task config directly. Once a stored
  // value advertises the v2 snapshot fields, malformed metadata must fail
  // closed instead of silently being treated as a legacy config.
  const snapshot = looksLikeSessionConfigSnapshot(value)
    ? parseSessionConfigSnapshot<TConfig>(value)
    : null
  return snapshot ? { config: snapshot.config, snapshot } : { config: value as TConfig, snapshot: null }
}

export const protocolForSnapshot = (snapshot: SessionConfigSnapshot): ProtocolDefinition => snapshot.protocol
