import { evaluateScaleSourceScientificQualification } from '../library/scientific-qualification'
import { compileScalePolicy } from '../policy/compile'
import {
  evaluateScaleDeployment,
  scaleDeploymentModeSchema,
  type ScaleDeploymentModeV1,
} from '../policy/deployment'
import { localizationNextActions, scaleLocalizationReasons, scaleLocalizationManualIssues } from '../policy/localization'
import { getScaleInstrumentSource } from './instrument-registry'
import { scaleInstrumentSourceV1Schema } from './schema'
import { validateScaleInstrumentSource, materializeCatalogManifest, materializeLocalizationManifest } from './validate-instrument'
import type { InstrumentAuthorizationRecordV1 } from '../../assessment-authorization/types'
import type { ScaleInstrumentSourceV1 } from './types'

export const previewScaleInstrument = (input: {
  source?: unknown
  instrumentKey?: string
  instrumentVersion?: string
  authorizations?: InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  commercialNature?: 'NON_COMMERCIAL' | 'COMMERCIAL'
  deploymentModes: ScaleDeploymentModeV1[]
  authorizationRefs?: string[]
  nowIso?: string
}) => {
  const source: ScaleInstrumentSourceV1 | undefined = input.source
    ? scaleInstrumentSourceV1Schema.parse(input.source) as unknown as ScaleInstrumentSourceV1
    : (input.instrumentKey && input.instrumentVersion ? getScaleInstrumentSource(input.instrumentKey, input.instrumentVersion) : undefined)
  if (!source) throw new Error('Scale instrument source not found')
  const validation = validateScaleInstrumentSource(source, { requireInstruction: true })
  const catalog = materializeCatalogManifest(source)
  const localization = materializeLocalizationManifest(source)
  const blockers = validation.issues.filter(issue => issue.severity === 'error').map(issue => `${issue.path}: ${issue.message}`)
  if (!source.executable) blockers.push(...(source.candidatePreview?.blockers ?? ['EXECUTABLE_NOT_REGISTERED']))
  const qualification = evaluateScaleSourceScientificQualification(source)
  const modes = input.deploymentModes.map(mode => scaleDeploymentModeSchema.parse(mode))
  if (modes.length === 0) blockers.push('DEPLOYMENT_MODES_MISSING')
  if (source.executable && source.executable.releaseStatus !== 'PUBLISHED') blockers.push('EXECUTABLE_NOT_PUBLISHED')
  const decisions = []
  let runtimePolicyHash: string | null = null
  if (source.executable) {
    const runtime = compileScalePolicy(source)
    runtimePolicyHash = runtime.runtimePolicyHash
    const policy = {
      schemaVersion: 2 as const,
      revision: 1,
      locale: input.locale,
      territory: input.territory,
      deploymentModes: modes,
      runtimePolicyHash: runtime.runtimePolicyHash,
      ...(localization?.localizationVersion ? { localizationVersion: localization.localizationVersion } : {}),
      inFlightCompletion: 'FROZEN_DEADLINE' as const,
    }
    blockers.push(...scaleLocalizationReasons(source, policy))
    for (const requestedMode of modes) {
      const decision = evaluateScaleDeployment({
        policy,
        requestedMode,
        instrumentKey: source.identity.instrumentKey,
        instrumentVersion: source.identity.instrumentVersion,
        compiledRuntimePolicyHash: runtime.runtimePolicyHash,
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
    manualReview: {
      localization: scaleLocalizationManualIssues(source),
      scientific: qualification,
      rights: source.executable?.definition.license ?? null,
      reportQc: source.executable?.definition.report.audienceContract?.qcReview ?? null,
    },
    report: {
      disclosureAudiences: source.disclosure ? Object.keys(source.disclosure.audiences) : [],
      educationalFeedback: Boolean(source.educationalFeedback),
      candidateReportPlan: source.candidatePreview?.reportPlan ?? null,
    },
    admission: { requestedModes: modes, decisions },
    allowActivation: source.executable ? [...new Set(blockers)].length === 0 : false,
    blockers: [...new Set(blockers)].sort(),
    nextActions: [...new Set(blockers)].sort().flatMap(code => {
      const action = localizationNextActions[code]
      return action ? [{ code, stage: action.stage, owner: action.owner, next: action.next }] : []
    }),
  }
}
