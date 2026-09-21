import { z } from 'zod'
import { situationDefinitionSchema } from '../situation-definition'
import { situationDefinitionV2Schema } from '../situation-branching'
import { canonicalHash } from '../../assessment-runtime/canonical'
import type { SituationPackage } from '../situation-package'

export const sourceIdentitySchema = z.object({
  instrumentKey: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  instrumentVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
}).strict()
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const response = z.object({ sceneKey: z.string().min(1), channelKey: z.string().min(1), responseValue: z.union([z.string(), z.number().finite()]), responseTimeMs: z.number().nonnegative().optional(), answeredAt: z.string().optional() }).strict()
export const instrumentContentSchema = z.object({
  schemaVersion: z.literal(1), identity: sourceIdentitySchema,
  catalogOrder: z.number().int().nonnegative().default(1000),
  definition: z.union([situationDefinitionSchema, situationDefinitionV2Schema]),
  goldenCases: z.array(z.object({ name: z.string().min(1), responses: z.array(response), expected: z.object({ quality: z.enum(['interpretable', 'limited', 'invalid']), metricKeys: z.array(z.string()), metrics: z.record(z.number().finite().nullable()) }).strict() }).strict()),
}).strict()
export const publicationSchema = z.object({
  releaseStatus: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']),
  review: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('migration'), baselineCommit: z.string().regex(/^[a-f0-9]{40}$/), contentDigest: digest }).strict(),
    z.object({ kind: z.literal('github-review'), reviewUrl: z.string().regex(/^https:\/\/github\.com\/caohuibj\/eduK12-new-version\/pull\/\d+#pullrequestreview-\d+$/), contentDigest: digest }).strict(),
  ]).optional(),
}).strict()
// PR1 reserves the governance boundary without activating a second maturity truth.
// PR2 extends this schema and connects it to the existing qualification resolver.
export const scientificSchema = z.object({ schemaVersion: z.literal(1), scientificMaturity: z.literal('PILOT'), governanceRevision: z.number().int().positive() }).strict()
export const instrumentSourceSchema = z.object({ content: instrumentContentSchema, publication: publicationSchema, scientific: scientificSchema }).strict()
export type SituationalInstrumentSourceV1 = z.infer<typeof instrumentSourceSchema>
export type SituationalInstrumentContentV1 = z.infer<typeof instrumentContentSchema>
export const publicationContentDigest = (content: SituationalInstrumentContentV1): string => canonicalHash({ gateVersion: 'situational-onboarding-v1', content })
export const projectSituationPackage = (source: SituationalInstrumentSourceV1): SituationPackage => ({
  key: source.content.identity.instrumentKey, instrumentVersion: source.content.identity.instrumentVersion,
  definition: source.content.definition, goldenCases: source.content.goldenCases,
  releaseStatus: source.publication.releaseStatus, scienceMaturity: 'PILOT',
} as SituationPackage)
