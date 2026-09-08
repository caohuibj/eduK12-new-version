import { describe, expect, it } from 'vitest'
import {
  evaluatePilotPublicationPolicy,
  evaluateScientificCompleteness,
  type HardLayerResult,
} from '../../modules/scale/library/pilot-publication-policy'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const ok = (): HardLayerResult => ({ ok: true, errors: [] })
const failed = (error: string): HardLayerResult => ({ ok: false, errors: [error] })

const manifest = () => parseScaleCatalogManifest(validCatalogManifestBase())
const emptyScientific = () => {
  const parsed = manifest()
  if (!parsed.ok) throw new Error('fixture manifest should parse')
  return evaluateScientificCompleteness({
    manifest: { ...parsed.manifest, evidence: [], referenceApplicability: [] },
    references: [],
    deploymentTerritory: 'CN',
  })
}

describe('Pilot-first publication policy (SL2-C3)', () => {
  it('publishes PUBLISHED + PILOT with a completely empty evidence matrix (§13 core)', () => {
    const decision = evaluatePilotPublicationPolicy({
      executableCorrectness: ok(),
      rights: ok(),
      localization: ok(),
      respondentMatch: ok(),
      scientific: emptyScientific(),
    })
    expect(decision.publishable).toBe(true)
    const codes = decision.researchGaps.map((gap) => gap.code)
    // §13 全部非 blocker 项都落入 research gap
    expect(codes).toContain('NO_LOCAL_NORM')
    expect(codes).toContain('NO_VALIDATED_NORM')
    expect(codes).toContain('NO_MEASUREMENT_INVARIANCE')
    expect(codes).toContain('NO_DEVICE_EQUIVALENCE')
    expect(codes).toContain('NO_TEST_RETEST')
    expect(codes).toContain('NO_RESPONSIVENESS')
    expect(codes).toContain('INCOMPLETE_CORE_VALIDITY_MATRIX')
    expect(codes).toContain('LIMITED_LOCAL_SAMPLE')
    expect(decision.limitations.some((line) => line.includes('scientificMaturity=PILOT'))).toBe(true)
  })

  it('never blocks on scientific gaps even at RESEARCH_GRADE (maturity ≠ license, §31 Case D spirit)', () => {
    const scientific = { ...emptyScientific(), scientificMaturity: 'RESEARCH_GRADE' as const }
    const decision = evaluatePilotPublicationPolicy({
      executableCorrectness: ok(),
      rights: ok(),
      localization: ok(),
      respondentMatch: ok(),
      scientific,
    })
    expect(decision.publishable).toBe(true)
    expect(decision.researchGaps.length).toBeGreaterThan(0)
    expect(decision.limitations.some((line) => line.includes('PILOT'))).toBe(false)
  })

  it('blocks on executable correctness failure', () => {
    const decision = evaluatePilotPublicationPolicy({
      executableCorrectness: failed('golden case mismatch'),
      rights: ok(),
      localization: ok(),
      respondentMatch: ok(),
      scientific: emptyScientific(),
    })
    expect(decision.publishable).toBe(false)
    expect(decision.errors.some((error) => error.includes('executableCorrectness'))).toBe(true)
  })

  it('blocks on rights failure (§14: rights denied stays fail-closed)', () => {
    const decision = evaluatePilotPublicationPolicy({
      executableCorrectness: ok(),
      rights: failed('who5@1.0.0 requires APPROVED|EVIDENCE_PENDING authorization'),
      localization: ok(),
      respondentMatch: ok(),
      scientific: emptyScientific(),
    })
    expect(decision.publishable).toBe(false)
    expect(decision.errors.some((error) => error.includes('rights'))).toBe(true)
  })

  it('blocks on unusable localization', () => {
    const decision = evaluatePilotPublicationPolicy({
      executableCorrectness: ok(),
      rights: ok(),
      localization: failed('translation rights DENIED'),
      respondentMatch: ok(),
      scientific: emptyScientific(),
    })
    expect(decision.publishable).toBe(false)
    expect(decision.errors.some((error) => error.includes('localization'))).toBe(true)
  })

  it('blocks on unsupported respondent (§29)', () => {
    const decision = evaluatePilotPublicationPolicy({
      executableCorrectness: ok(),
      rights: ok(),
      localization: ok(),
      respondentMatch: failed('requested respondent TEACHER not in declared respondentTypes [SELF]'),
      scientific: emptyScientific(),
    })
    expect(decision.publishable).toBe(false)
    expect(decision.errors.some((error) => error.includes('respondentMatch'))).toBe(true)
  })

  it('derives completeness from catalog manifest and references, removing satisfied gaps', () => {
    const parsed = manifest()
    if (!parsed.ok) throw new Error('fixture manifest should parse')
    const summary = evaluateScientificCompleteness({
      manifest: parsed.manifest,
      references: [],
      deploymentTerritory: 'CN',
    })
    expect(summary.evidenceCount).toBe(2)
    // fixture 有 CN descriptive applicability（非 normative）→ 仍无 local norm
    expect(summary.hasLocalNorm).toBe(false)
    expect(summary.hasDeviceEquivalence).toBe(false)
    const decision = evaluatePilotPublicationPolicy({
      executableCorrectness: ok(),
      rights: ok(),
      localization: ok(),
      respondentMatch: ok(),
      scientific: summary,
    })
    expect(decision.publishable).toBe(true)
  })

  it('uses one applicable local evidence record instead of summing records without sampleId', () => {
    const parsed = manifest()
    if (!parsed.ok) throw new Error('fixture manifest should parse')
    const baseEvidence = parsed.manifest.evidence[0]
    const splitSampleManifest = {
      ...parsed.manifest,
      evidence: [
        { ...baseEvidence, evidenceId: 'local-sample-a', sampleSize: 200 },
        { ...baseEvidence, evidenceId: 'local-sample-b', evidenceType: 'STRUCTURAL_VALIDITY' as const, sampleSize: 200 },
        { ...baseEvidence, evidenceId: 'foreign-large-sample', locale: 'en', territory: 'GB', sampleSize: 1000 },
      ],
    }
    const splitSummary = evaluateScientificCompleteness({
      manifest: splitSampleManifest,
      references: [],
      deploymentTerritory: 'CN',
    })
    expect(splitSummary.hasSufficientLocalSample).toBe(false)

    const thresholdSummary = evaluateScientificCompleteness({
      manifest: {
        ...parsed.manifest,
        evidence: [{ ...baseEvidence, evidenceId: 'local-sample-threshold', sampleSize: 300 }],
      },
      references: [],
      deploymentTerritory: 'CN',
    })
    expect(thresholdSummary.hasSufficientLocalSample).toBe(true)
  })
})
