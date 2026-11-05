import type { ScaleDefinitionV2, DefinitionIssue } from '../scale-definition'
import { isValidContentLocaleTag } from '../content-locale'

/** Presentation structure only. Editorial and scientific review remain manual. */
export function validateAudienceReport(definition: ScaleDefinitionV2): DefinitionIssue[] {
  if (!definition.versionAxes) return [] // Preserve frozen legacy definitions.
  const issues: DefinitionIssue[] = []
  const fail = (path: string, message: string) => issues.push({ path: 'report.' + path, message, severity: 'error' })
  const report = definition.report
  const contract = report.audienceContract
  // Report language belongs to the frozen report revision. Questionnaire
  // language remains the measurement/localization axis and deployment scope.
  if (!contract || !isValidContentLocaleTag(contract.locale)) fail('audienceContract', 'AUDIENCE_LANGUAGE_QC_REQUIRED')
  if (!report.limitations.length) fail('limitations', 'REPORT_BOUNDARIES_REQUIRED')
  for (const key of report.primaryScoreKeys) {
    const entries = report.interpretations.filter(entry => entry.scoreKey === key)
    if (entries.length !== 1) {
      fail('interpretations', 'REPORT_SCORE_COVERAGE_REQUIRED')
      continue
    }
    if (new Set(entries[0].bands.map(band => band.key)).size !== entries[0].bands.length) fail('bands', 'REPORT_BAND_KEYS_DUPLICATE')
  }
  return issues
}
