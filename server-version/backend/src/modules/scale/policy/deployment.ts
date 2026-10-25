import { z } from 'zod'
import { canonicalHash } from '../../assessment-runtime/canonical'
import type { InstrumentAuthorizationRecordV1 } from '../../assessment-authorization/types'
import type { InstrumentUsageRequirementsV1 } from './types'

export const SCALE_DEPLOYMENT_POLICY_SCHEMA_VERSION = 2 as const
export const SCALE_DEPLOYMENT_EVALUATOR_VERSION = 'scale-deployment-v2' as const

export const scaleDeploymentModeSchema = z.enum([
  'STANDALONE',
  'QUESTIONNAIRE',
  'PUBLIC_QUESTIONNAIRE',
  'COMPOSITE',
])
export type ScaleDeploymentModeV1 = z.infer<typeof scaleDeploymentModeSchema>

export const scaleDeploymentRightActionSchema = z.enum([
  'electronicAdministration',
  'scoring',
  'translation',
  'display',
])
export type ScaleDeploymentRightActionV1 = z.infer<typeof scaleDeploymentRightActionSchema>

export const scaleDeploymentPolicyV1Schema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  locale: z.string().min(1),
  territory: z.string().regex(/^[A-Z]{2}$/),
  deploymentModes: z.array(scaleDeploymentModeSchema).min(1),
  commercialNature: z.enum(['NON_COMMERCIAL', 'COMMERCIAL', 'UNSPECIFIED']),
  requiredRightsActions: z.array(scaleDeploymentRightActionSchema).min(1),
  authorizationRefs: z.array(z.string().min(1)),
  selfAuthoredSourceHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  runtimePolicyHash: z.string().regex(/^[0-9a-f]{64}$/),
  localizationVersion: z.string().min(1).optional(),
  inFlightCompletion: z.literal('FROZEN_DEADLINE'),
  completionWindowMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1000).optional(),
}).strict().superRefine((policy, ctx) => {
  if (!policy.selfAuthoredSourceHash && (!policy.authorizationRefs.length || policy.commercialNature === 'UNSPECIFIED'))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['authorizationRefs'], message: 'External tools require authorization references and declared commercial nature' })
  if (policy.selfAuthoredSourceHash && policy.authorizationRefs.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['authorizationRefs'], message: 'Authored provenance cannot be mixed with external authorization grants' })
})

export type ScaleDeploymentPolicyV1 = z.infer<typeof scaleDeploymentPolicyV1Schema>

/** New deployments carry operational/scientific identity only. V1 remains an
 * exact read-only decoder: never strip fields before verifying a historic hash. */
export const scaleDeploymentPolicyV2Schema = z.object({
  schemaVersion: z.literal(2), revision: z.number().int().positive(),
  locale: z.string().min(1), territory: z.string().regex(/^[A-Z]{2}$/),
  deploymentModes: z.array(scaleDeploymentModeSchema).min(1),
  runtimePolicyHash: z.string().regex(/^[0-9a-f]{64}$/),
  localizationVersion: z.string().min(1).optional(),
  inFlightCompletion: z.literal('FROZEN_DEADLINE'),
  completionWindowMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1000).optional(),
}).strict()
export type ScaleDeploymentPolicyV2 = z.infer<typeof scaleDeploymentPolicyV2Schema>
export const scaleDeploymentPolicySchema = z.union([scaleDeploymentPolicyV1Schema, scaleDeploymentPolicyV2Schema])
export type ScaleDeploymentPolicy = ScaleDeploymentPolicyV1 | ScaleDeploymentPolicyV2

export interface ScaleDeploymentDecisionV1 {
  evaluatorVersion: typeof SCALE_DEPLOYMENT_EVALUATOR_VERSION
  allowNewStarts: boolean
  deploymentPolicyHash: string
  reasons: string[]
  authorization: null | {
    authorizationId: string
    version: number
    status: InstrumentAuthorizationRecordV1['status']
  }
}

export const hashScaleDeploymentPolicy = (input: ScaleDeploymentPolicy): string => (
  canonicalHash(scaleDeploymentPolicySchema.parse(input))
)

/** Copyright/use-license records are not a deployment gate. Legacy arguments
 * are accepted for source compatibility but never inspected or persisted. */
export const evaluateScaleDeployment = (input: {
  policy: ScaleDeploymentPolicy
  requestedMode: ScaleDeploymentModeV1
  instrumentKey: string
  instrumentVersion: string
  compiledRuntimePolicyHash: string
  authorizations?: InstrumentAuthorizationRecordV1[]
  usageRequirements?: InstrumentUsageRequirementsV1
  nowIso?: string
}): ScaleDeploymentDecisionV1 => {
  const policy = scaleDeploymentPolicySchema.parse(input.policy)
  const reasons: string[] = []
  if (policy.runtimePolicyHash !== input.compiledRuntimePolicyHash) reasons.push('RUNTIME_POLICY_HASH_MISMATCH')
  if (!policy.deploymentModes.includes(input.requestedMode)) reasons.push('DEPLOYMENT_MODE_NOT_BOUND')
  if (input.usageRequirements?.allowedDeploymentModes?.length
    && !input.usageRequirements.allowedDeploymentModes.includes(input.requestedMode)) reasons.push('DEPLOYMENT_MODE_NOT_ALLOWED')
  return { evaluatorVersion: SCALE_DEPLOYMENT_EVALUATOR_VERSION, allowNewStarts: reasons.length === 0,
    deploymentPolicyHash: hashScaleDeploymentPolicy(policy), reasons: [...new Set(reasons)], authorization: null }
}
