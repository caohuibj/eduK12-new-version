import type { SituationalInstrumentSourceV1 } from '../../../modules/situational/onboarding/schema'
import { projectSituationPackage } from '../../../modules/situational/onboarding/schema'
import { situationalExecutionRef } from '../../../modules/situational/onboarding/scientific-qualification'
import { scientificEvidenceDigest } from '../../../modules/situational/onboarding/scientific-governance'

/** Isolated test receipt; never included in a production manifest. */
export function declareScience(source: SituationalInstrumentSourceV1, maturity: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE', revision = 3) {
  const executionRef = situationalExecutionRef(projectSituationPackage(source))
  const scope = { language: 'zh-CN', population: 'adult volunteers', use: 'research', claim: 'construct association' }
  source.scientific = {
    schemaVersion: 1, scientificMaturity: maturity, governanceRevision: revision,
    changeReason: 'Isolated test governance transition', knownLimitations: ['Test evidence only'], claimScope: scope,
    evidence: (['RESEARCH_FOUNDATION', 'PROVENANCE', 'EMPIRICAL_REFERENCE', 'FORMAL_OUTPUT'] as const).map(kind => ({ id: kind, kind, reference: `protocol:${kind}`, executionRef, scope, reviewReference: 'fixture-review-only' })),
  }
  if (maturity !== 'PILOT') source.scientific.review = {
    reviewUrl: 'https://github.com/caohuibj/eduK12-new-version/pull/999#pullrequestreview-123',
    reviewer: 'independent-reviewer', reviewedAt: '2026-09-21T00:00:00.000Z', executionRef,
    evidenceDigest: scientificEvidenceDigest(source.scientific), targetMaturity: maturity, scope, governanceRevision: revision,
  }
  return source
}
