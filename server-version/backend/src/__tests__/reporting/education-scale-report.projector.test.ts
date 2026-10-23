import { createFrozenUnitAdmission } from '../../modules/assessment-runtime/admission-snapshot'
import { createFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { createFrozenUnitAdmissionV2ForTest } from '../../modules/assessment-runtime/admission-snapshot-v2'
import { createFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { resolveEducationScaleReportPersistedBinding, type EducationScaleReportPersistedFacts } from '../../modules/reporting/education-scale-report.binding'
import { describe, expect, it } from 'vitest'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { compileScalePolicy } from '../../modules/scale/policy/compile'
import { createFrozenScaleRuntimeSnapshotV2ForTest, type FrozenScaleRuntimeSnapshotV2 } from '../../modules/assessment-runtime/runtime-snapshot-v2'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { resultAudiences, type ResultDisclosureContractV1 } from '../../modules/assessment-policy/result-disclosure'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import type { ScaleResultV2 } from '../../modules/scale/scale-result'
import { educationLibraryV1ProjectionPolicy, projectEducationScaleIndividualReport, type EducationScaleReportProjectionInput, type EducationScaleReportBinding } from '../../modules/reporting/education-scale-report.projector'
import { projectedReportImage } from '../../modules/reporting/report-image-delivery'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

function fixture(contentAudience: 'student' | 'teacher' = 'student'): EducationScaleReportProjectionInput & { binding: EducationScaleReportBinding } {
  const score = (key: string): ScaleResultV2['scores'][number] => ({
    key, type: 'dimension', label: key, direction: 'descriptive', canonical: true,
    displayPrecision: 1, value: 3, range: { min: 0, max: 10 }, expectedItems: ['Q1'],
    answeredItems: ['Q1'], status: 'calculated', prorated: false,
  })
  const result: ScaleResultV2 = {
    schemaVersion: 2,
    instrument: { scaleId: 'scale-1', code: 'example', name: 'Example', instrumentVersion: 'v1' },
    method: { scaleId: 'scale-1', instrumentVersion: 'v1', scoringVersion: 'v1', reportVersion: 'r1',
      reportAudience: 'student', definitionHash: 'd'.repeat(64), referenceVersions: [], assessmentContext: null },
    quality: { status: 'interpretable', flags: [] }, itemScores: [], scores: [score('allowed'), score('hidden')],
    references: ['allowed', 'hidden'].map(scoreKey => ({
      scoreKey, referenceVersion: 'ref-v1', referenceKind: 'theoretical_range', evidenceLevel: 'theoretical',
      status: 'unavailable', unavailableReason: 'not_requested', label: `${scoreKey} reference`,
      value: null, mean: null, sd: null, z: null, t: null, percentile: null, criterionBand: null,
      meanDifference: null, source: null, population: null, instrumentVersion: 'v1', scoringVersion: 'v1',
      limitations: [], disclaimer: 'Reference description',
    })), interpretations: ['allowed', 'hidden'].map(scoreKey => ({
      scoreKey, headline: scoreKey, label: null, interpretation: `${scoreKey} explanation`, guidance: [],
      limitations: [], referenceVersion: null,
    })),
    rawScoreFeedback: ['allowed', 'hidden'].map(scoreKey => ({ scoreKey, rangeKey: 'range', text: `${scoreKey} text`,
      images: [{ order: 0, altText: `${scoreKey} image`, asset: { assetId: `${scoreKey}-image`, contentHash: 'a'.repeat(64), mimeType: 'image/png' } }],
    })), caveats: ['global caveat'], disclaimer: 'Not a diagnosis',
  }
  const contract: ResultDisclosureContractV1 = {
    schemaVersion: 1, policyKey: 'p1', minimumRespondents: null,
    audiences: Object.fromEntries(resultAudiences.map(audience => [audience, {
      mode: audience === 'RESPONDENT' || audience === 'SUBJECT' ? 'INDIVIDUAL_SUMMARY' : 'NONE',
      metricKeys: audience === 'RESPONDENT' || audience === 'SUBJECT' ? ['allowed'] : [], longitudinalMetricKeys: [],
    }])) as ResultDisclosureContractV1['audiences'],
  }
  const full = DISCLOSURE_PRESETS.FULL_REPORT()
  const source = structuredClone(getScaleInstrumentSource('adexi_v1', '2.0.0')!)
  source.disclosure = { schemaVersion: 1, policyVersion: 'p1', unknownAudience: 'DENY',
    audiences: { respondent: { ...full }, subject: { ...full } } }
  const definition = source.executable!.definition
  definition.versionAxes = { schemaVersion: 1, subjectKey: 'test_subject', locale: 'zh-CN', localizationVersion: '1' }
  definition.report.audienceContract = { schemaVersion: 1, respondent: contentAudience === 'teacher' ? 'ADULT_SELF' : 'STUDENT_SELF',
    audience: contentAudience, locale: 'zh-CN', qcReview: { reviewer: 'fixture', reviewedAt: '2026-10-22T00:00:00.000Z', basis: 'synthetic test' } }
  definition.report.reportVersion = 'r1'
  const snapshot = createFrozenScaleRuntimeSnapshotV2ForTest({ instrumentKey: source.identity.instrumentKey,
    instrumentVersion: source.identity.instrumentVersion, definition, compiledPolicy: compileScalePolicy(source),
    frozenAt: new Date('2026-10-22T00:00:00.000Z') })
  result.instrument.code = snapshot.instrumentKey
  result.instrument.instrumentVersion = snapshot.instrumentVersion
  result.method.instrumentVersion = snapshot.instrumentVersion
  result.method.definitionHash = snapshot.legacyDefinitionHash
  result.method.reportAudience = contentAudience
  return {
    report: { type: 'SCALE', kind: 'scale', scaleId: 'scale-1', scaleName: 'Example', result,
      quality: result.quality, scores: result.scores, references: result.references,
      interpretations: result.interpretations, rawScoreFeedback: result.rawScoreFeedback,
      caveats: result.caveats, disclaimer: result.disclaimer, method: result.method,
      completedAt: null, totalTime: null },
    binding: { scaleId: 'scale-1', definitionHash: result.method.definitionHash, instrumentVersion: snapshot.instrumentVersion,
      reportVersion: 'r1', runtimePolicyHash: snapshot.runtimePolicyHash, resultDisclosureHash: canonicalHash(contract),
      snapshotHash: snapshot.snapshotHash, sourceDefinitionHash: snapshot.sourceDefinitionHash },
    resultDisclosure: contract, resultAudience: 'RESPONDENT', frozenSnapshot: snapshot,
    context: { principalId: 'user-1', audience: 'respondent', purpose: 'report',
      accessDecision: { source: 'RESOURCE_AUTHORIZATION', allowed: true, capabilities: { ...full } },
      frozenPolicy: { disposition: 'FROZEN_V2', runtimePolicyHash: snapshot.runtimePolicyHash,
        disclosure: structuredClone(snapshot.compiledPolicy.disclosure) },
      currentRestrictions: { ...full }, relationalDisposition: 'INDIVIDUAL_ALLOWED' },
  }
}

describe('education scale pure report projection (not live authority)', () => {
  it('narrows all score-owned text/images and does not mutate the stored result', () => {
    const input = fixture()
    const before = JSON.stringify(input)
    const output = projectEducationScaleIndividualReport(input)
    expect(output.state).toBe('PROJECTED')
    expect(JSON.stringify(output)).toContain('allowed text')
    expect(JSON.stringify(output)).not.toContain('hidden')
    expect(JSON.stringify(output)).not.toContain('global caveat')
    expect(JSON.stringify(input)).toBe(before)
    expect(projectedReportImage(output, 'allowed-image')?.assetId).toBe('allowed-image')
    expect(projectedReportImage(output, 'hidden-image')).toBeUndefined()
  })

  it('uses the explicit subject contract rather than respondent permission for observer feedback', () => {
    const input = fixture()
    input.resultAudience = 'SUBJECT'; input.context.audience = 'subject'
    expect(projectEducationScaleIndividualReport(input).state).toBe('PROJECTED')
    input.context.audience = 'respondent'
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })

  it.each(['PROFESSIONAL', 'ORGANIZATION', 'TEACHER', 'PARENT', 'RESEARCH'] as const)('does not invent an individual authority mapping for %s', audience => {
    const input = fixture(); input.resultAudience = audience
    expect(projectEducationScaleIndividualReport(input)).toEqual({ state: 'WITHHELD' })
  })

  it('does not disguise Teacher self-report as teacher authority', () => {
    const input = fixture('teacher')
    expect(projectEducationScaleIndividualReport(input).state).toBe('PROJECTED')
    input.context.audience = 'teacher'
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })

  it.each(['definitionHash', 'instrumentVersion', 'reportVersion', 'runtimePolicyHash', 'resultDisclosureHash', 'snapshotHash', 'sourceDefinitionHash'] as const)('withholds a mismatching frozen %s', field => {
    const input = fixture(); input.binding[field] = 'new-version'
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })

  it('fails closed for an unknown contract metric, even if the supplied hash agrees', () => {
    const input = fixture()
    const contract = input.resultDisclosure as ResultDisclosureContractV1
    contract.audiences.RESPONDENT.metricKeys.push('unknown')
    input.binding.resultDisclosureHash = canonicalHash(contract)
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })

  it('preserves capability restrictions including raw feedback and range labels', () => {
    const input = fixture(); input.context.currentRestrictions.scoreDerivedLabels = false
    const projected = projectEducationScaleIndividualReport(input)
    expect(JSON.stringify(projected)).toContain('"rangeKey":null')
    input.context.currentRestrictions.individualInterpretations = false
    expect(projectedReportImage(projectEducationScaleIndividualReport(input), 'allowed-image')).toBeUndefined()
  })

  it.each(['denied', 'cohort', 'unknown-policy', 'invalid-result', 'missing-content-audience'] as const)('withholds %s', reason => {
    const input = fixture()
    if (reason === 'denied') input.context.accessDecision.allowed = false
    if (reason === 'cohort') input.context.relationalDisposition = 'COHORT_ONLY'
    if (reason === 'unknown-policy') input.context.frozenPolicy.disposition = 'UNKNOWN'
    if (reason === 'invalid-result') input.report.result!.quality.status = 'invalid'
    if (reason === 'missing-content-audience') delete input.report.result!.method.reportAudience
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })
})


describe('frozen report content authority', () => {
  it('supports Teacher respondent text/images without borrowing teacher disclosure', () => {
    const input = fixture('teacher')
    const output = projectEducationScaleIndividualReport(input)
    expect(JSON.stringify(output)).toContain('allowed text')
    expect(projectedReportImage(output, 'allowed-image')?.assetId).toBe('allowed-image')
    expect(input.context.audience).toBe('respondent')
    input.context.currentRestrictions.individualInterpretations = false
    expect(projectedReportImage(projectEducationScaleIndividualReport(input), 'allowed-image')).toBeUndefined()
  })

  it('rejects changed report contents even if measurement identity/version are unchanged', () => {
    const input = fixture()
    const snapshot = input.frozenSnapshot as FrozenScaleRuntimeSnapshotV2
    const before = snapshot.legacyDefinitionHash
    snapshot.definition.report.reportVersion = 'changed'
    // The full snapshot/source check is required even for packages where the
    // measurement hash excludes the report (versionAxes definitions).
    expect(input.binding.definitionHash).toBe(before)
    expect(hashScaleDefinition(snapshot.definition)).toBe(before)
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })

  it('rejects a valid newly generated snapshot when the stored expected hash remains old', () => {
    const input = fixture()
    input.frozenSnapshot = fixture('teacher').frozenSnapshot
    input.report.result!.method.reportAudience = 'teacher'
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })

  it('does not permit client-like unknown raw feedback text or images', () => {
    const input = fixture()
    input.report.result!.rawScoreFeedback!.push({ scoreKey: 'unknown', rangeKey: 'unknown', text: 'unknown-secret',
      images: [{ order: 0, altText: 'unknown-secret', asset: { assetId: 'unknown-image', contentHash: 'a'.repeat(64), mimeType: 'image/png' } }] })
    const output = projectEducationScaleIndividualReport(input)
    expect(JSON.stringify(output)).not.toContain('unknown-secret')
    expect(projectedReportImage(output, 'unknown-image')).toBeUndefined()
  })

  it('rejects a missing frozen report audience instead of inferring it from entry or role', () => {
    const input = fixture()
    delete (input.frozenSnapshot as FrozenScaleRuntimeSnapshotV2).definition.report.audienceContract
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })
})


function persistedFixture(): EducationScaleReportProjectionInput & { persistedFacts: EducationScaleReportPersistedFacts } {
  const input = fixture('teacher')
  const runtime = input.frozenSnapshot as FrozenScaleRuntimeSnapshotV2
  const sourceHash = runtime.sourceDefinitionHash, compiledHash = runtime.compiledRuntime.compiledRuntimeHash
  const admission = createFrozenUnitAdmissionV2ForTest({ attemptEpoch: 1,
    scale: { id: 'scale-1', code: runtime.instrumentKey, name: 'Example', instrumentVersion: runtime.instrumentVersion },
    principal: { userId: 'user-1' },
    parent: { kind: 'composite', parentId: 'attempt-1', slotKey: 'scale:item-1', sourceDefinitionHash: sourceHash, compiledRuntimeHash: compiledHash },
    scalePolicy: { runtimePolicyHash: runtime.runtimePolicyHash, eligibility: {
      schemaVersion: 1, evaluatorVersion: 'test', policyVersion: 'p1', policyHash: runtime.runtimePolicyHash,
      contextHash: null, identityBindingHash: 'a'.repeat(64), contextFrozenAt: null,
      evaluatedAt: '2026-10-22T00:00:00.000Z', outcome: 'ELIGIBLE', reasons: [],
      factProvenance: { subject: 'test', respondent: 'test' },
    } }, frozenAt: new Date('2026-10-22T00:00:00.000Z'),
  })
  const slotSet = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
    slots: [{ slotKey: 'scale:item-1', unitType: 'SCALE', required: true,
      sourceDefinitionIdentity: { key: runtime.instrumentKey, version: runtime.instrumentVersion, hash: sourceHash },
      sourceBinding: { compositeItemId: 'item-1', compiledRuntimeHash: compiledHash } }],
  })
  const facts: EducationScaleReportPersistedFacts = {
    actorUserId: 'user-1', resultDisclosureHash: input.binding.resultDisclosureHash, admission, slotSet,
    parent: { id: 'attempt-1', attemptEpoch: 1, frozenActiveSlotSetHash: slotSet.snapshotHash },
    assessment: { id: 'assessment-1', scaleId: 'scale-1', userId: 'user-1', compositeAttemptId: 'attempt-1',
      compositeItemId: 'item-1', attemptEpoch: 1, status: 'COMPLETED', submissionId: 'submission-1',
      compiledRuntimeHash: compiledHash, frozenAdmissionSnapshotHash: admission.snapshotHash },
    finalUnit: { compositeAttemptId: 'attempt-1', attemptEpoch: 1, slotKey: 'scale:item-1', unitType: 'SCALE',
      terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT', sourceType: 'ASSESSMENT', sourceAttemptId: 'assessment-1',
      sourceSubmissionId: 'submission-1', sourceDefinitionHash: sourceHash, compiledRuntimeHash: compiledHash },
  }
  const { binding: _oldBinding, ...rest } = input
  return { ...rest, report: { ...input.report, assessmentId: 'assessment-1' }, persistedFacts: facts }
}

describe('existing admission, slot and FINAL persistence anchors', () => {
  it('projects without inventing an independently persisted runtime snapshot hash', () => {
    const input = persistedFixture()
    const bound = resolveEducationScaleReportPersistedBinding(input.persistedFacts, input.frozenSnapshot)
    expect(bound).not.toHaveProperty('snapshotHash')
    expect(input).not.toHaveProperty('binding')
    const output = projectEducationScaleIndividualReport(input)
    expect(output.state).toBe('PROJECTED')
    expect(projectedReportImage(output, 'allowed-image')?.assetId).toBe('allowed-image')
  })

  it.each(['admission-hash', 'slot-hash', 'parent', 'epoch', 'assessment-owner', 'context-owner', 'report-assessment',
    'final-source', 'final-compiled', 'final-submission', 'final-assessment', 'final-parent', 'final-epoch', 'final-slot',
    'final-state', 'final-kind'] as const)('withholds mismatched %s', reason => {
    const input = persistedFixture(), facts = input.persistedFacts
    if (reason === 'admission-hash') facts.assessment.frozenAdmissionSnapshotHash = 'b'.repeat(64)
    if (reason === 'slot-hash') facts.parent.frozenActiveSlotSetHash = 'b'.repeat(64)
    if (reason === 'parent') facts.parent.id = 'other'
    if (reason === 'epoch') facts.parent.attemptEpoch = 2
    if (reason === 'assessment-owner') facts.assessment.userId = 'other'
    if (reason === 'context-owner') input.context.principalId = 'other'
    if (reason === 'report-assessment') input.report.assessmentId = 'other'
    if (reason === 'final-source') facts.finalUnit.sourceDefinitionHash = 'b'.repeat(64)
    if (reason === 'final-compiled') facts.finalUnit.compiledRuntimeHash = 'b'.repeat(64)
    if (reason === 'final-submission') facts.finalUnit.sourceSubmissionId = 'other'
    if (reason === 'final-assessment') facts.finalUnit.sourceAttemptId = 'other'
    if (reason === 'final-parent') facts.finalUnit.compositeAttemptId = 'other'
    if (reason === 'final-epoch') facts.finalUnit.attemptEpoch = 2
    if (reason === 'final-slot') facts.finalUnit.slotKey = 'scale:other'
    if (reason === 'final-state') facts.finalUnit.terminalState = 'SKIPPED'
    if (reason === 'final-kind') facts.finalUnit.payloadKind = 'COLLECTION_FACTS'
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })

  it('refuses conflicting old and new anchors', () => {
    const input = persistedFixture()
    input.binding = fixture().binding
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })

  it('does not allow a newly self-consistent runtime to replace the report pinned by independent FINAL/admission/slot anchors', () => {
    const input = persistedFixture()
    input.frozenSnapshot = fixture('student').frozenSnapshot
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })
})


function libraryV1Fixture() {
  const input = persistedFixture()
  const original = input.frozenSnapshot as FrozenScaleRuntimeSnapshotV2
  const runtime = createFrozenScaleRuntimeSnapshot({ instrumentKey: original.instrumentKey,
    instrumentVersion: original.instrumentVersion, definition: original.definition, referenceBindings: original.referenceBindings })
  const originalAdmission = input.persistedFacts.admission as ReturnType<typeof createFrozenUnitAdmissionV2ForTest>
  const admission = createFrozenUnitAdmission({ attemptEpoch: originalAdmission.attemptEpoch,
    scale: originalAdmission.scale, principal: originalAdmission.principal, parent: originalAdmission.parent })
  input.frozenSnapshot = runtime
  input.persistedFacts.admission = admission
  input.persistedFacts.assessment.frozenAdmissionSnapshotHash = admission.snapshotHash
  input.persistedFacts.approvedLibrarySource = { approvedSnapshotHash: 'c'.repeat(64),
    sourceDefinitionHash: original.sourceDefinitionHash, resultDisclosureHash: input.persistedFacts.resultDisclosureHash }
  input.context.frozenPolicy = educationLibraryV1ProjectionPolicy()
  return input
}

describe('approved library real V1 compatibility', () => {
  it('keeps V1 honest while projecting only respondent allowed metrics and hit images', () => {
    const input = libraryV1Fixture()
    const binding = resolveEducationScaleReportPersistedBinding(input.persistedFacts, input.frozenSnapshot)
    expect(binding).not.toHaveProperty('runtimePolicyHash')
    expect(input.context.frozenPolicy.disposition).toBe('LEGACY_PROFILE')
    const output = projectEducationScaleIndividualReport(input)
    expect(output.state).toBe('PROJECTED')
    expect(JSON.stringify(output)).toContain('allowed text')
    expect(JSON.stringify(output)).not.toContain('hidden text')
    expect(projectedReportImage(output, 'allowed-image')).toBeDefined()
    expect(projectedReportImage(output, 'hidden-image')).toBeUndefined()
  })

  it.each(['missing-library', 'missing-approved-hash', 'source', 'disclosure', 'admission-version', 'subject', 'fake-policy', 'new-current-definition'] as const)(
    'withholds real V1 when %s does not match the approved frozen lane', reason => {
      const input = libraryV1Fixture()
      if (reason === 'missing-library') delete input.persistedFacts.approvedLibrarySource
      if (reason === 'missing-approved-hash') delete (input.persistedFacts.approvedLibrarySource as Partial<NonNullable<EducationScaleReportPersistedFacts['approvedLibrarySource']>>).approvedSnapshotHash
      if (reason === 'source') input.persistedFacts.approvedLibrarySource!.sourceDefinitionHash = 'b'.repeat(64)
      if (reason === 'disclosure') input.persistedFacts.approvedLibrarySource!.resultDisclosureHash = 'b'.repeat(64)
      if (reason === 'admission-version') {
        const v2 = persistedFixture().persistedFacts
        input.persistedFacts.admission = v2.admission
        input.persistedFacts.assessment.frozenAdmissionSnapshotHash = v2.assessment.frozenAdmissionSnapshotHash
      }
      if (reason === 'subject') { input.resultAudience = 'SUBJECT'; input.context.audience = 'subject' }
      if (reason === 'fake-policy') input.context.frozenPolicy.runtimePolicyHash = 'b'.repeat(64)
      if (reason === 'new-current-definition') {
        const current = structuredClone(input.frozenSnapshot) as ReturnType<typeof createFrozenScaleRuntimeSnapshot>
        current.definition.report.reportVersion = 'new-current-version'
        input.frozenSnapshot = createFrozenScaleRuntimeSnapshot({ instrumentKey: current.instrumentKey,
          instrumentVersion: current.instrumentVersion, definition: current.definition })
      }
      expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
    },
  )
})


describe('author-private real V1 fixed-version report identity', () => {
  function privateV1Fixture() {
    const input = libraryV1Fixture()
    const source = input.persistedFacts.approvedLibrarySource!
    delete input.persistedFacts.approvedLibrarySource
    input.persistedFacts.privateVersionSource = { versionId: 'abcddcba-1234-4321-a123-123456789abc',
      contentHash: 'a'.repeat(64), sourceDefinitionHash: source.sourceDefinitionHash, resultDisclosureHash: source.resultDisclosureHash }
    return input
  }
  it('uses a private persisted version proof without pretending it was library-approved', () => {
    const input = privateV1Fixture()
    expect(input.persistedFacts.approvedLibrarySource).toBeUndefined()
    const output = projectEducationScaleIndividualReport(input)
    expect(output.state).toBe('PROJECTED')
    expect(projectedReportImage(output, 'allowed-image')).toBeDefined()
    expect(projectedReportImage(output, 'hidden-image')).toBeUndefined()
  })
  it.each(['missing', 'version', 'content', 'source', 'disclosure', 'ambiguous'] as const)('withholds private V1 with invalid %s proof', reason => {
    const input = privateV1Fixture()
    const proof = input.persistedFacts.privateVersionSource!
    if (reason === 'missing') delete input.persistedFacts.privateVersionSource
    if (reason === 'version') proof.versionId = ''
    if (reason === 'content') proof.contentHash = ''
    if (reason === 'source') proof.sourceDefinitionHash = 'b'.repeat(64)
    if (reason === 'disclosure') proof.resultDisclosureHash = 'b'.repeat(64)
    if (reason === 'ambiguous') input.persistedFacts.approvedLibrarySource = { approvedSnapshotHash: 'c'.repeat(64),
      sourceDefinitionHash: proof.sourceDefinitionHash, resultDisclosureHash: proof.resultDisclosureHash }
    expect(projectEducationScaleIndividualReport(input).state).toBe('WITHHELD')
  })
})
