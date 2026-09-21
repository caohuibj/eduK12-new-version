import { legacyDeploymentGateReasons } from './legacy-gates'
import { scaleLocalizationReasons } from '../policy/localization'
import type { Prisma, PrismaClient } from '@prisma/client'
import { getScaleInstrumentRuntimePolicy, getScaleInstrumentSource } from '../onboarding/instrument-registry'
import { getLegacyScaleCompatibilityProfile } from '../policy/legacy-profile'
import {
  evaluateScaleDeployment,
  type ScaleDeploymentDecisionV1,
  type ScaleDeploymentModeV1,
} from '../policy/deployment'
import type { CompiledScalePolicyV1 } from '../policy/compile'
import {
  listScaleInstrumentAuthorizations,
  readActiveScaleDeployment,
  type StoredScaleDeploymentPolicyV1,
} from './repository'

type Db = PrismaClient | Prisma.TransactionClient

export type ScaleStartDeploymentResolution =
  | {
      kind: 'LEGACY_V1'
      allowNewStarts: true
      reasons: string[]
      runtimePolicy: null
      deployment: null
      decision: null
    }
  | {
      kind: 'MANAGED_V2'
      allowNewStarts: boolean
      reasons: string[]
      runtimePolicy: CompiledScalePolicyV1
      deployment: StoredScaleDeploymentPolicyV1
      decision: ScaleDeploymentDecisionV1
    }
  | {
      kind: 'DENY'
      allowNewStarts: false
      reasons: string[]
      runtimePolicy: CompiledScalePolicyV1 | null
      deployment: StoredScaleDeploymentPolicyV1 | null
      decision: ScaleDeploymentDecisionV1 | null
    }

export const resolveScaleStartDeployment = async (input: {
  db: Db
  scale: {
    id: string
    code: string
    instrumentVersion: string
    instrumentClass: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
    status: string
  }
  /**
   * Omit only while freezing the immutable runtime before a parent surface has
   * activated the child admission. In that mode all declared deployment modes
   * are validated for current rights, but the concrete surface is enforced at
   * admission before item delivery.
   */
  requestedMode?: ScaleDeploymentModeV1
  now?: Date
}): Promise<ScaleStartDeploymentResolution> => {
  if (input.scale.status !== 'PUBLISHED') {
    return {
      kind: 'DENY',
      allowNewStarts: false,
      reasons: ['SCALE_NOT_PUBLISHED'],
      runtimePolicy: null,
      deployment: null,
      decision: null,
    }
  }

  // Teacher-created descriptive instruments predate governed source/deployment
  // registration. PR-3 does not silently reinterpret or disable them.
  if (input.scale.instrumentClass === 'CUSTOM_DESCRIPTIVE') {
    return {
      kind: 'LEGACY_V1',
      allowNewStarts: true,
      reasons: ['CUSTOM_DESCRIPTIVE_LEGACY_COMPAT'],
      runtimePolicy: null,
      deployment: null,
      decision: null,
    }
  }

  const source = getScaleInstrumentSource(input.scale.code, input.scale.instrumentVersion)
  const runtimePolicy = getScaleInstrumentRuntimePolicy(input.scale.code, input.scale.instrumentVersion)
  if (!source?.executable || !runtimePolicy) {
    return {
      kind: 'DENY',
      allowNewStarts: false,
      reasons: ['EXECUTABLE_RUNTIME_POLICY_MISSING'],
      runtimePolicy: runtimePolicy ?? null,
      deployment: null,
      decision: null,
    }
  }

  const deployment = await readActiveScaleDeployment(input.db, input.scale.id)
  if (!deployment) {
    // Six existing executable identities remain on the explicit PR-1 legacy
    // profile until PR-4 migrates their deployment rows. Any newly onboarded
    // STANDARD identity must have an ACTIVE binding before its first start.
    if (getLegacyScaleCompatibilityProfile(input.scale.code, input.scale.instrumentVersion)) {
      return {
        kind: 'LEGACY_V1',
        allowNewStarts: true,
        reasons: ['LEGACY_DEPLOYMENT_NOT_MIGRATED'],
        runtimePolicy: null,
        deployment: null,
        decision: null,
      }
    }
    return {
      kind: 'DENY',
      allowNewStarts: false,
      reasons: ['DEPLOYMENT_BINDING_MISSING'],
      runtimePolicy,
      deployment: null,
      decision: null,
    }
  }

  const reasons: string[] = scaleLocalizationReasons(source, deployment.policy)
  if (source.executable.releaseStatus !== 'PUBLISHED') reasons.push('EXECUTABLE_NOT_PUBLISHED')
  if (deployment.policy.locale !== runtimePolicy.contentLocale) reasons.push('DEPLOYMENT_CONTENT_LOCALE_MISMATCH')
  const localizationVersion = source.localization?.localizationVersion
  if (
    deployment.policy.localizationVersion
    && deployment.policy.localizationVersion !== localizationVersion
  ) reasons.push('DEPLOYMENT_LOCALIZATION_VERSION_MISMATCH')

  const authorizations = await listScaleInstrumentAuthorizations(
    input.db,
    input.scale.code,
    input.scale.instrumentVersion,
  )
  reasons.push(...legacyDeploymentGateReasons(input.scale.code, input.scale.instrumentVersion, deployment.policy, authorizations, (input.now ?? new Date()).toISOString()))
  const modes = input.requestedMode ? [input.requestedMode] : deployment.policy.deploymentModes
  let decision: ScaleDeploymentDecisionV1 | null = null
  for (const requestedMode of modes) {
    const current = evaluateScaleDeployment({
      policy: deployment.policy,
      requestedMode,
      instrumentKey: input.scale.code,
      instrumentVersion: input.scale.instrumentVersion,
      compiledRuntimePolicyHash: runtimePolicy.runtimePolicyHash,
      authorizations,
      usageRequirements: runtimePolicy.usageRequirements,
      nowIso: (input.now ?? new Date()).toISOString(),
    })
    decision ??= current
    reasons.push(...current.reasons)
  }

  const effectiveDecision = decision ?? evaluateScaleDeployment({
    policy: deployment.policy,
    requestedMode: input.requestedMode ?? 'STANDALONE',
    instrumentKey: input.scale.code,
    instrumentVersion: input.scale.instrumentVersion,
    compiledRuntimePolicyHash: runtimePolicy.runtimePolicyHash,
    authorizations,
    usageRequirements: runtimePolicy.usageRequirements,
    nowIso: (input.now ?? new Date()).toISOString(),
  })

  return {
    kind: 'MANAGED_V2',
    allowNewStarts: reasons.length === 0 && effectiveDecision.allowNewStarts,
    reasons: [...new Set(reasons)],
    runtimePolicy,
    deployment,
    decision: effectiveDecision,
  }
}

export const assertScaleStartDeploymentAllowed = async (
  input: Parameters<typeof resolveScaleStartDeployment>[0],
): Promise<Exclude<ScaleStartDeploymentResolution, { kind: 'DENY' }>> => {
  const resolution = await resolveScaleStartDeployment(input)
  if (!resolution.allowNewStarts) {
    throw new Error(`Scale new start denied: ${resolution.reasons.join(',') || 'UNKNOWN'}`)
  }
  return resolution
}
