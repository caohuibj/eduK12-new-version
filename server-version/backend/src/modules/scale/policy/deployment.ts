import { z } from 'zod'
import { canonicalHash } from '../../assessment-runtime/canonical'
import {
  assertLocaleTerritoryMatch,
  evaluateAuthorizationOverlayStatus,
  resolveEffectiveAuthorization,
} from '../../assessment-authorization/publish-gates'
import type { InstrumentAuthorizationRecordV1 } from '../../assessment-authorization/types'
import type { InstrumentUsageRequirementsV1 } from './types'

export const SCALE_DEPLOYMENT_POLICY_SCHEMA_VERSION = 1 as const
export const SCALE_DEPLOYMENT_EVALUATOR_VERSION = 'scale-deployment-v1' as const

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
  schemaVersion: z.literal(SCALE_DEPLOYMENT_POLICY_SCHEMA_VERSION),
  revision: z.number().int().positive(),
  locale: z.string().min(1),
  territory: z.string().regex(/^[A-Z]{2}$/),
  deploymentModes: z.array(scaleDeploymentModeSchema).min(1),
  commercialNature: z.enum(['NON_COMMERCIAL', 'COMMERCIAL']),
  requiredRightsActions: z.array(scaleDeploymentRightActionSchema).min(1),
  authorizationRefs: z.array(z.string().min(1)).min(1),
  runtimePolicyHash: z.string().regex(/^[0-9a-f]{64}$/),
  localizationVersion: z.string().min(1).optional(),
  inFlightCompletion: z.literal('FROZEN_DEADLINE'),
  completionWindowMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1000).optional(),
}).strict()

export type ScaleDeploymentPolicyV1 = z.infer<typeof scaleDeploymentPolicyV1Schema>

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

export const hashScaleDeploymentPolicy = (input: ScaleDeploymentPolicyV1): string => (
  canonicalHash(scaleDeploymentPolicyV1Schema.parse(input))
)

const actionAllowed = (record: InstrumentAuthorizationRecordV1, action: ScaleDeploymentRightActionV1): boolean => {
  if (action === 'electronicAdministration') return record.scope.electronicAdministration
  if (action === 'scoring') return record.scope.scoring
  if (action === 'translation') return record.scope.translation
  return record.scope.display
}

const requiredActions = (
  policy: ScaleDeploymentPolicyV1,
  usageRequirements?: InstrumentUsageRequirementsV1,
): ScaleDeploymentRightActionV1[] => {
  const allowed = new Set(scaleDeploymentRightActionSchema.options)
  const sourceActions = usageRequirements?.requiredRightsActions
    .filter((action): action is ScaleDeploymentRightActionV1 => allowed.has(action as ScaleDeploymentRightActionV1)) ?? []
  return [...new Set<ScaleDeploymentRightActionV1>(['electronicAdministration', 'scoring', 'display', ...policy.requiredRightsActions, ...sourceActions])].sort()
}

export const evaluateScaleDeployment = (input: {
  policy: ScaleDeploymentPolicyV1
  requestedMode: ScaleDeploymentModeV1
  instrumentKey: string
  instrumentVersion: string
  compiledRuntimePolicyHash: string
  authorizations: InstrumentAuthorizationRecordV1[]
  usageRequirements?: InstrumentUsageRequirementsV1
  nowIso?: string
}): ScaleDeploymentDecisionV1 => {
  const policy = scaleDeploymentPolicyV1Schema.parse(input.policy)
  const nowIso = input.nowIso ?? new Date().toISOString()
  const reasons: string[] = []

  if (policy.runtimePolicyHash !== input.compiledRuntimePolicyHash) {
    reasons.push('RUNTIME_POLICY_HASH_MISMATCH')
  }
  if (!policy.deploymentModes.includes(input.requestedMode)) {
    reasons.push('DEPLOYMENT_MODE_NOT_BOUND')
  }
  if (
    input.usageRequirements?.allowedDeploymentModes
    && input.usageRequirements.allowedDeploymentModes.length > 0
    && !input.usageRequirements.allowedDeploymentModes.includes(input.requestedMode)
  ) {
    reasons.push('DEPLOYMENT_MODE_NOT_ALLOWED')
  }

  // A revocation supersedes older grants in the same lineage; a newer DRAFT does not.
  const eligibleLineages = input.authorizations.filter(row => {
    const revocations = input.authorizations.filter(candidate => candidate.authorizationId === row.authorizationId
      && candidate.instrumentKey === row.instrumentKey && candidate.instrumentVersion === row.instrumentVersion
      && candidate.status === 'REVOKED')
    return !revocations.some(revoked => revoked.version >= row.version && row.status !== 'REVOKED')
  })
  const boundAuthorizations = eligibleLineages.filter(row => policy.authorizationRefs.includes(row.authorizationId))
  if (!boundAuthorizations.length && input.authorizations.length) reasons.push('AUTHORIZATION_BINDING_STALE')
  if (input.usageRequirements?.requiredRightsActions.some(action => !scaleDeploymentRightActionSchema.safeParse(action).success)) {
    reasons.push('UNSUPPORTED_RIGHTS_ACTION')
  }
  const effective = resolveEffectiveAuthorization({
    authorizations: boundAuthorizations,
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    nowIso,
  })
  if (!effective) {
    reasons.push('AUTHORIZATION_MISSING')
    return {
      evaluatorVersion: SCALE_DEPLOYMENT_EVALUATOR_VERSION,
      allowNewStarts: false,
      deploymentPolicyHash: hashScaleDeploymentPolicy(policy),
      reasons,
      authorization: null,
    }
  }

  const overlay = evaluateAuthorizationOverlayStatus(effective, nowIso)
  if (effective.status !== 'APPROVED' && effective.status !== 'EVIDENCE_PENDING') reasons.push(`AUTHORIZATION_${overlay}`)
  if (overlay === 'DRAFT' || overlay === 'EXPIRED' || overlay === 'REVOKED') reasons.push(`AUTHORIZATION_${overlay}`)

  const scope = assertLocaleTerritoryMatch({
    record: effective,
    locale: policy.locale,
    territory: policy.territory,
  })
  if (!scope.ok) reasons.push('AUTHORIZATION_SCOPE_MISMATCH')

  if (effective.scope.commercialNature === 'UNSPECIFIED') reasons.push('AUTHORIZATION_COMMERCIAL_NATURE_UNKNOWN')
  if (
    effective.scope.commercialNature === 'NON_COMMERCIAL'
    && policy.commercialNature === 'COMMERCIAL'
  ) reasons.push('COMMERCIAL_NATURE_MISMATCH')

  for (const action of requiredActions(policy, input.usageRequirements)) {
    if (!actionAllowed(effective, action)) reasons.push(`RIGHT_${action}_MISSING`)
  }

  if (!policy.authorizationRefs.includes(effective.authorizationId)) {
    reasons.push('AUTHORIZATION_BINDING_STALE')
  }

  return {
    evaluatorVersion: SCALE_DEPLOYMENT_EVALUATOR_VERSION,
    allowNewStarts: reasons.length === 0,
    deploymentPolicyHash: hashScaleDeploymentPolicy(policy),
    reasons: [...new Set(reasons)],
    authorization: {
      authorizationId: effective.authorizationId,
      version: effective.version,
      status: effective.status,
    },
  }
}
