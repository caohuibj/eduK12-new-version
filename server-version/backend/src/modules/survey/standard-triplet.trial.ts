import { resolveScaleReference } from '../assessment-reference/reference'
import { canonicalHash } from '../assessment-runtime/canonical'
import { renderDeclaredReport, type ReportReferenceFact } from '../measurement-content/report-renderer'
import { hashScaleDefinition } from '../scale/scale-definition'
import { scoreScale } from '../scale/scale-scoring'
import type { Triplet } from './standard-triplet.model'

/** The same three deterministic cases are used by the content checker and publisher. */
export function computeDeclaredStandardTrial(triplet: Triplet) {
  const {definition, references, toolKey, instrumentVersion, template} = triplet
  return [0, 0.5, 1].map((fraction, caseIndex) => {
    const answers = definition.items.map(item => {
      const set = definition.responseSets.find(candidate => candidate.key === item.responseSetKey)!
      return {itemCode: item.itemCode, responseValue: set.options[Math.floor((set.options.length - 1) * fraction)].value}
    })
    const scores = scoreScale(definition, answers)
    if (!scores.scores.length || scores.scores.some(score => score.status !== 'calculated' || typeof score.value !== 'number' || !Number.isFinite(score.value))) {
      throw new Error('试运行未产生完整有效分数')
    }
    const referenceFacts: ReportReferenceFact[] = scores.scores.flatMap(score => resolveScaleReference({
      policy: definition.referencePolicy,
      references,
      instrumentKey: toolKey,
      instrumentVersion,
      scoringVersion: definition.scoring.scoringVersion,
      score,
      measurementHash: hashScaleDefinition(definition),
    }).map(reference => ({
      metricKey: score.key,
      referenceKind: reference.referenceKind,
      status: reference.status === 'available' ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
      bandKey: reference.criterionBand?.key ?? null,
      reason: reference.unavailableReason === 'missing_context' ? 'MISSING_CONTEXT' : reference.unavailableReason,
    })))
    const report = template ? renderDeclaredReport(template, scores.scores.map(score => ({
      metricKey: score.key,
      value: score.value,
      unit: 'points',
      status: 'INTERPRETABLE',
    })), referenceFacts) : null
    if (template && (!report || template.blocks.length > 0 && !report.blocks.length)) {
      throw new Error('试运行未产生有效报告')
    }
    const value = {caseIndex, answers, scores, report}
    return {...value, recordHash: canonicalHash(value)}
  })
}
