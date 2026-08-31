import { buildPackageCognitiveAnalysis } from './package-analysis.engine'
import type {
  CognitivePackageAnalysisResult,
  FrozenCognitiveModuleResult,
  FrozenScaleModuleResult,
} from './cognitive-analysis.types'
import type { FrozenReportPackageSnapshot } from './report-package-freeze'
import {
  buildMentalHealthBundleAnalysis,
  isMentalHealthBundleAnalysisResult,
  MENTAL_HEALTH_ANALYSIS_ENGINE_KEY,
  type FrozenBundleScaleEvidence,
  type MentalHealthBundleAnalysisResult,
} from '../mental-health-bundle'

export type PackageAnalysisResult = CognitivePackageAnalysisResult | MentalHealthBundleAnalysisResult
export type PackageAnalysisEngineKey = 'cognitive-v1' | typeof MENTAL_HEALTH_ANALYSIS_ENGINE_KEY

export const packageAnalysisEngineKeyFor = (
  snapshot: Pick<FrozenReportPackageSnapshot, 'analysisEngineKey' | 'packageDefinition'>,
): PackageAnalysisEngineKey => {
  const packageEngineKey = snapshot.packageDefinition.analysisEngineKey ?? 'cognitive-v1'
  if (snapshot.analysisEngineKey && snapshot.analysisEngineKey !== packageEngineKey) {
    throw new Error('报告包冻结快照声明了冲突的 analysis engine')
  }
  return snapshot.analysisEngineKey ?? packageEngineKey
}

export interface DispatchPackageAnalysisInput {
  packageSnapshot: FrozenReportPackageSnapshot
  moduleResults?: FrozenCognitiveModuleResult[]
  scaleResults?: FrozenScaleModuleResult[]
  bundleScaleResults?: FrozenBundleScaleEvidence[]
  attemptId?: string
  assessmentId?: string
  subject?: { userId?: string | null; subjectKey?: string | null }
  respondent?: { userId?: string | null; respondentKey?: string | null; respondentType?: string }
  assessmentEpisodeId?: string | null
}

/**
 * The package boundary is the only place that selects an analysis engine.
 * Existing cognitive packages keep their historical engine and types; mental
 * health Bundles use the deterministic CORE → FACET → CONTEXT → SAFETY engine.
 */
export const dispatchPackageAnalysis = (input: DispatchPackageAnalysisInput): PackageAnalysisResult => {
  const engineKey = packageAnalysisEngineKeyFor(input.packageSnapshot)
  if (engineKey === MENTAL_HEALTH_ANALYSIS_ENGINE_KEY) {
    const bundle = input.packageSnapshot.bundleDefinitionSnapshot
      ?? (input.packageSnapshot.packageDefinition.bundleDefinition as Parameters<typeof buildMentalHealthBundleAnalysis>[0]['bundle'])
    if (!bundle) throw new Error('Mental health package snapshot 缺少 Bundle definition')
    return buildMentalHealthBundleAnalysis({
      bundle,
      packageKey: input.packageSnapshot.packageKey,
      packageVersion: input.packageSnapshot.packageVersion,
      profile: input.packageSnapshot.profile,
      scaleResults: input.bundleScaleResults ?? [],
      attemptId: input.attemptId,
      assessmentId: input.assessmentId,
      subject: input.subject,
      respondent: input.respondent,
      assessmentEpisodeId: input.assessmentEpisodeId,
    })
  }
  return buildPackageCognitiveAnalysis({
    packageSnapshot: input.packageSnapshot,
    moduleResults: input.moduleResults ?? [],
    scaleResults: input.scaleResults,
    attemptId: input.attemptId,
    assessmentId: input.assessmentId,
  })
}

export const isMentalHealthPackageAnalysis = isMentalHealthBundleAnalysisResult
