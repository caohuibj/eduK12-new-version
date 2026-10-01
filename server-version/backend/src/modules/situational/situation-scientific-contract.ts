import { z } from 'zod'

const key = z.string().min(1).max(160).refine(value => !value.includes(':') && value.trim().length > 0)
const text = z.string().trim().min(1).max(2000)
const digest = z.string().regex(/^[a-f0-9]{64}$/)

export const MEASUREMENT_BUNDLE_LIMITS = { required: 4, optionalDiagnostics: 4, total: 6 } as const
export const measurementBundleSchema = z.object({
  contractVersion: z.literal('measurement-bundle-v1'),
  maxRequiredResponses: z.number().int().min(1).max(MEASUREMENT_BUNDLE_LIMITS.required),
  maxOptionalDiagnosticResponses: z.number().int().min(0).max(MEASUREMENT_BUNDLE_LIMITS.optionalDiagnostics),
  maxTotalResponses: z.number().int().min(1).max(MEASUREMENT_BUNDLE_LIMITS.total),
  estimatedSeconds: z.number().int().min(1).max(1800),
}).strict()

export const optionEvidenceSchema = z.object({
  semanticVersion: text,
  // Observable content coding only. No inferred trait, weight or score here.
  observable: z.object({
    communicationChannel: text.optional(), recipient: text.optional(), timing: text.optional(),
    requestsVerification: z.boolean().optional(), referencesEvidence: z.boolean().optional(),
    proposesChange: z.boolean().optional(), offersTask: z.boolean().optional(), namesOwner: z.boolean().optional(),
    coordination: text.optional(), setsReviewPoint: z.boolean().optional(), conditionality: text.optional(),
    implementationAction: text.optional(), boundarySetting: text.optional(),
  }).strict(),
  opportunities: z.array(z.object({
    constructKey: key,
    role: z.enum(['PRIMARY_CANDIDATE', 'SECONDARY_CANDIDATE', 'COMPETING_CONSTRUCT', 'EXTERNAL_EXPLANATORY', 'FORBIDDEN_INFERENCE']),
    rationale: text,
  }).strict()).max(16),
}).strict()

export const scoringModelSchema = z.object({
  contractVersion: z.literal('situational-model-v1'),
  modelKey: z.enum(['PROVISIONAL_SCALAR', 'EXPERT_KEY', 'CONSENSUS_KEY', 'CRITERION_KEY', 'NOMINAL_UNIDIMENSIONAL', 'NOMINAL_MULTIDIMENSIONAL']),
  modelVersion: text,
  // Calibration is a content-addressed offline artifact, never executable code.
  parameterSet: z.object({
    id: key, version: text, hash: digest,
    calibration: z.object({ artifactRef: text, artifactHash: digest, population: text, method: text, calibratedAt: z.string().datetime({ offset: true }) }).strict(),
    uncertainty: z.object({ method: text, artifactRef: text }).strict().optional(),
    references: z.array(z.object({ sceneKey: key, channelKey: key, optionKey: key, constructKey: key, parameterRef: text }).strict()).max(16000),
  }).strict().optional(),
  // An explicit provisional expert key. Candidate semantics never supply these numbers.
  expertKey: z.array(z.object({ sceneKey: key, channelKey: key, optionKey: key, metricKey: key, contribution: z.number().finite().min(-1_000_000).max(1_000_000) }).strict()).max(16000).optional(),
}).strict()
export type SituationalScoringModel = z.infer<typeof scoringModelSchema>

export const responseStageSchema = z.object({
  stageKey: key,
  kind: z.enum(['PRE_CHOICE_PROBE', 'CHOICE', 'POST_CHOICE_PROBE']),
  channelKeys: z.array(key).min(1).max(6),
}).strict()

export const researchAssignmentSchema = z.object({
  assignmentVersion: text,
  groups: z.array(z.object({
    groupKey: key, nodeKey: key,
    variants: z.array(z.object({
      variantKey: key, weight: z.number().int().positive().max(1000000),
      omittedChannelKeys: z.array(key).max(4),
      probeTiming: z.enum(['DEFINED', 'PRE_CHOICE', 'POST_CHOICE']),
      stimulusVariantKey: key.optional(),
    }).strict()).min(1).max(16),
  }).strict()).min(1).max(120),
}).strict()

export const MISSINGNESS_REASONS = ['STRUCTURAL_NOT_REACHED', 'PLANNED_NOT_ADMINISTERED', 'PARTICIPANT_SKIPPED', 'TECHNICAL_FAILURE', 'INVALIDATED_BY_HISTORY_CHANGE'] as const
export const researchEventSchema = z.object({
  type: z.enum(['NODE_EXPOSED', 'RESPONSE_FIRST_COMMITTED', 'RESPONSE_CHANGED', 'PROBE_EXPOSED', 'STAGE_CONFIRMED', 'NODE_CONFIRMED', 'RESPONSE_INVALIDATED']),
  nodeKey: key,
  channelKey: key.optional(),
  responseValue: z.union([z.string().max(160), z.number().finite()]).optional(),
  responseRevision: z.number().int().positive().max(4096).optional(),
  relativeTimeMs: z.number().int().nonnegative().max(2592000000),
  historyIdentity: z.string().regex(/^[a-f0-9]{64}$/),
  stageKey: key.optional(),
}).strict().superRefine((event, ctx) => {
  const response = event.type === 'RESPONSE_FIRST_COMMITTED' || event.type === 'RESPONSE_CHANGED'
  const invalidation = event.type === 'RESPONSE_INVALIDATED'
  const staged = event.type === 'PROBE_EXPOSED' || event.type === 'STAGE_CONFIRMED'
  const fail = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
  if ((response || invalidation) !== (event.channelKey !== undefined)) fail('channelKey', 'Channel identity is exclusive and required for response evidence')
  if (response !== (event.responseValue !== undefined) || response !== (event.responseRevision !== undefined)) fail('responseValue', 'Raw value and revision are exclusive and required for response commits')
  if (staged && event.stageKey === undefined || !staged && !response && event.stageKey !== undefined) fail('stageKey', 'Stage identity is exclusive to stage/probe evidence and staged responses')
})
export const researchCaptureSchema = z.object({
  captureVersion: z.literal('situational-capture-v1'),
  definitionHash: digest,
  assignmentIdentity: digest,
  // No mouse, keyboard, focus or media telemetry. Bounded meaningful commits only.
  events: z.array(researchEventSchema).max(4096),
  unansweredReasons: z.array(z.object({ nodeKey: key, channelKey: key, reason: z.enum(['PARTICIPANT_SKIPPED', 'TECHNICAL_FAILURE']) }).strict()).max(480).optional(),
}).strict()
export type SituationalResearchCapture = z.infer<typeof researchCaptureSchema>
