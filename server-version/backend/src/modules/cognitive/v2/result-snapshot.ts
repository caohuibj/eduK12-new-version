import { z } from 'zod'
import type { CognitiveResultSnapshot } from './types'

const qualityStateSchema = z.enum(['interpretable', 'limited', 'invalid'])

export const cognitiveResultSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  completedAt: z.string().datetime({ offset: true }),
  testType: z.string().min(1),
  configVersion: z.string().min(1),
  engineVersion: z.string().min(1),
  scoringVersion: z.string().min(1),
  protocolSignature: z.string().regex(/^[0-9a-f]{64}$/),
  profile: z.enum(['experience', 'standard', 'research']).nullable(),
  metrics: z.record(z.unknown()),
  quality: z.object({
    state: qualityStateSchema,
    flags: z.record(z.boolean()),
    reasons: z.array(z.string()),
  }).strict(),
  references: z.array(z.record(z.unknown())),
  report: z.record(z.unknown()),
  assessmentContext: z.object({
    schemaVersion: z.literal(1),
    snapshotHash: z.string().min(1),
  }).strict().nullable(),
}).strict()

export const parseCognitiveResultSnapshot = (value: unknown): CognitiveResultSnapshot => (
  cognitiveResultSnapshotSchema.parse(value) as CognitiveResultSnapshot
)
