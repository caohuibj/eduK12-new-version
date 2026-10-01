import { canonicalHash } from '../assessment-runtime/canonical'
import { legacySituationalScientificContext } from './onboarding/scientific-schema'
import { situationalExecutionRef } from './onboarding/scientific-qualification'
import { scientificEvidenceDigest } from './onboarding/scientific-governance'
import { DEFAULT_SCIENTIFIC_MATURITY, type ScientificMaturity } from '../assessment-governance/scientific-maturity'
import { getSituationPackage } from './situation-package.registry'
import { getSituationalScientificDeclaration } from './onboarding/scientific-registry'

/** Current catalog governance. Historical projections must use frozen context. */
export const resolveSituationalScientificMaturity = (
  instrumentKey: string,
  instrumentVersion: string,
): ScientificMaturity => {
  if (!getSituationPackage(instrumentKey, instrumentVersion)) {
    throw new Error(`Unknown situational scientific identity: ${instrumentKey}@${instrumentVersion}`)
  }
  // Explicit E2E fixtures have no production scientific declaration.
  return getSituationalScientificDeclaration(instrumentKey, instrumentVersion)?.scientificMaturity
    ?? DEFAULT_SCIENTIFIC_MATURITY
}

export const resolveSituationalScientificContext = (pkg: import('./situation-package').SituationPackage) => {
  const declaration = getSituationalScientificDeclaration(pkg.key, pkg.instrumentVersion)
  if (!declaration && !getSituationPackage(pkg.key,pkg.instrumentVersion) && pkg.definition.scoring.model?.modelKey==='AUTHOR_KEY_SUM') {
    const executionRef=situationalExecutionRef(pkg)
    // Administrative release does not qualify as scientific validation.
    return {schemaVersion:1 as const,scientificMaturity:'PILOT' as const,governanceRevision:1,
      scope:{language:'zh-CN',population:pkg.definition.respondentType==='teacher_self_report'?'教师试点参与者':'学生试点参与者',use:'低风险反思试点',claim:'作者暂定贡献和情境选择描述；未完成独立专家验证或实证校准'},
      executionRef,evidenceDigest:canonicalHash({policy:'sjt-upload-pilot-v1',executionRef,source:pkg.definition.source,license:pkg.definition.license,limitations:pkg.definition.report.limitations})}
  }
  if (!declaration) return undefined // explicit fixtures; historical legacy is never backfilled
  return {
    schemaVersion: 1 as const,
    scientificMaturity: declaration.scientificMaturity,
    governanceRevision: declaration.governanceRevision,
    scope: declaration.claimScope,
    executionRef: situationalExecutionRef(pkg),
    evidenceDigest: scientificEvidenceDigest(declaration),
    ...(declaration.review ? { reviewUrl: declaration.review.reviewUrl } : {}),
  }
}

export const currentSituationalScientificProjection = (pkg: import('./situation-package').SituationPackage) => {
  const context = resolveSituationalScientificContext(pkg)
  return context ? { ...context, provenance: 'CURRENT' as const } : legacySituationalScientificContext()
}
