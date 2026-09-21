import { evaluateScaleSourceScientificQualification } from '../library/scientific-qualification'
import { qualificationAllowsScientificMaturity } from '../../assessment-governance/scientific-qualification'
import { compileScalePolicy } from '../policy/compile'
import {
  evaluateScaleDeployment,
  scaleDeploymentModeSchema,
  type ScaleDeploymentModeV1,
} from '../policy/deployment'
import { scaleLocalizationReasons } from '../policy/localization'
import { getScaleInstrumentSource } from './instrument-registry'
import { scaleInstrumentSourceV1Schema } from './schema'
import { validateScaleInstrumentSource, materializeCatalogManifest, materializeLocalizationManifest } from './validate-instrument'
import type { InstrumentAuthorizationRecordV1 } from '../../assessment-authorization/types'
import type { ScaleInstrumentSourceV1 } from './types'

export const previewScaleInstrument = (input: {
  source?: unknown
  instrumentKey?: string
  instrumentVersion?: string
  authorizations: InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  commercialNature: 'NON_COMMERCIAL' | 'COMMERCIAL'
  deploymentModes: ScaleDeploymentModeV1[]
  authorizationRefs?: string[]
  nowIso?: string
}) => {
  const source: ScaleInstrumentSourceV1 | undefined = input.source
    ? scaleInstrumentSourceV1Schema.parse(input.source) as unknown as ScaleInstrumentSourceV1
    : (input.instrumentKey && input.instrumentVersion ? getScaleInstrumentSource(input.instrumentKey, input.instrumentVersion) : undefined)
  if (!source) throw new Error('Scale instrument source not found')
  const validation = validateScaleInstrumentSource(source)
  const catalog = materializeCatalogManifest(source)
  const localization = materializeLocalizationManifest(source)
  const blockers = validation.issues.filter(issue => issue.severity === 'error').map(issue => `${issue.path}: ${issue.message}`)
  if (!source.executable) blockers.push(...(source.candidatePreview?.blockers ?? ['EXECUTABLE_NOT_REGISTERED']))
  const qualification = evaluateScaleSourceScientificQualification(source)
  if (source.executable && !qualificationAllowsScientificMaturity(source.catalog.scientificMaturity, qualification)) blockers.push('SCIENTIFIC_CLAIM_NOT_QUALIFIED')
  if (source.executable && source.catalog.scientificMaturity !== 'PILOT' && source.scientificReview?.territory !== input.territory) blockers.push('SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH')
  const modes = input.deploymentModes.map(mode => scaleDeploymentModeSchema.parse(mode))
  if (modes.length === 0) blockers.push('DEPLOYMENT_MODES_MISSING')
  if (source.executable && source.executable.releaseStatus !== 'PUBLISHED') blockers.push('EXECUTABLE_NOT_PUBLISHED')
  const decisions = []
  let runtimePolicyHash: string | null = null
  if (source.executable) {
    const runtime = compileScalePolicy(source)
    runtimePolicyHash = runtime.runtimePolicyHash
    const refs = input.authorizationRefs?.length
      ? input.authorizationRefs
      : [...new Set(input.authorizations.map(record => record.authorizationId))]
    const policy = {
      schemaVersion: 1 as const,
      revision: 1,
      locale: input.locale,
      territory: input.territory,
      deploymentModes: modes,
      commercialNature: input.commercialNature,
      requiredRightsActions: ['electronicAdministration', 'scoring', 'display'] as Array<'electronicAdministration' | 'scoring' | 'display'>,
      authorizationRefs: refs.length ? refs : ['__MISSING_AUTHORIZATION__'],
      runtimePolicyHash: runtime.runtimePolicyHash,
      ...(localization?.localizationVersion ? { localizationVersion: localization.localizationVersion } : {}),
      inFlightCompletion: 'FROZEN_DEADLINE' as const,
    }
    blockers.push(...scaleLocalizationReasons(source, policy))
    for (const requestedMode of modes) {
      const decision = evaluateScaleDeployment({
        policy: { ...policy, requiredRightsActions: [...policy.requiredRightsActions] },
        requestedMode,
        instrumentKey: source.identity.instrumentKey,
        instrumentVersion: source.identity.instrumentVersion,
        compiledRuntimePolicyHash: runtime.runtimePolicyHash,
        authorizations: input.authorizations,
        usageRequirements: runtime.usageRequirements,
        nowIso: input.nowIso,
      })
      decisions.push({ requestedMode, ...decision })
      blockers.push(...decision.reasons)
    }
  }
  return {
    identity: source.identity,
    sourceValidation: { ok: validation.issues.every(issue => issue.severity !== 'error'), issues: validation.issues },
    executable: source.executable ? { releaseStatus: source.executable.releaseStatus, runtimePolicyHash } : null,
    scientific: { catalogStatus: catalog.catalogStatus, scientificMaturity: catalog.scientificMaturity, evidenceCount: catalog.evidence.length, qualification, review: source.scientificReview ?? null },
    localization: localization ?? null,
    report: {
      disclosureAudiences: source.disclosure ? Object.keys(source.disclosure.audiences) : [],
      educationalFeedback: Boolean(source.educationalFeedback),
      candidateReportPlan: source.candidatePreview?.reportPlan ?? null,
    },
    admission: { requestedModes: modes, decisions },
    allowActivation: source.executable ? [...new Set(blockers)].length === 0 : false,
    blockers: [...new Set(blockers)].sort(),
  }
}
