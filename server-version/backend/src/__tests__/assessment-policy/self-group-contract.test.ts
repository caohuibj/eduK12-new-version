import { describe, expect, it } from 'vitest'
import type { CanonicalUnitResultCoreV1 } from '../../modules/assessment-runtime/unit-result'
import type { RelationalApplicabilityV1 } from '../../modules/assessment-relational/types'
import { assertSelfGroupOwnSummaryCeiling, assertSelfGroupV2Entry, buildSelfGroupCohortAnalysisPolicy,
  isSelfGroupV2Entry, resolveSelfGroupLeafIdentity, selfGroupAggregateCeiling,
  SELF_GROUP_POLICY_KEY } from '../../modules/assessment-policy/self-group-contract'
import { testDisclosure } from './result-disclosure.fixture'

describe('new explicit SELF GROUP contract', () => {
  it('requires a v2 SELF contract, preserves own ceilings and checks each aggregate audience independently', () => {
    const approved = testDisclosure()
    approved.audiences.RESPONDENT = { mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['score', 'dimension'], longitudinalMetricKeys: ['score'] }
    const contract = testDisclosure(20)
    contract.policyKey = SELF_GROUP_POLICY_KEY
    contract.audiences.RESPONDENT = { ...approved.audiences.RESPONDENT, metricKeys: ['score'] }
    contract.audiences.ORGANIZATION = { mode: 'ORGANIZATION_AGGREGATE', metricKeys: ['score'], longitudinalMetricKeys: [] }
    assertSelfGroupOwnSummaryCeiling({ approved, proposed: contract })
    expect(selfGroupAggregateCeiling({ contract, audience: 'PROFESSIONAL' })).toBeNull()
    expect(selfGroupAggregateCeiling({ contract, audience: 'TEACHER' })).toBeNull()
    expect(selfGroupAggregateCeiling({ contract, audience: 'ORGANIZATION' })).toMatchObject({ minimumRespondents: 20, metricKeys: ['score'] })
    const applicability: RelationalApplicabilityV1 = { schemaVersion: 1, resourceKind: 'SCALE', resourceKey: 'teacher-scale:example:GROUP',
      resourceVersion: '2.0.0', subjectRoles: ['TEACHER'], respondentRoles: ['TEACHER'], relationshipKinds: ['SELF'],
      perspectives: ['SELF_REPORT'], analysisMode: 'COHORT_AGGREGATE', visibilityPolicyKey: SELF_GROUP_POLICY_KEY, minimumRespondents: 20 }
    const entry = { applicability, resultDisclosure: contract, cohortAnalysisPolicy: buildSelfGroupCohortAnalysisPolicy(contract) }
    assertSelfGroupV2Entry(entry)
    expect(isSelfGroupV2Entry({ ...entry, applicability: { ...applicability, perspectives: ['OBSERVER_REPORT'] } })).toBe(false)
    expect(isSelfGroupV2Entry({ ...entry, resultDisclosure: { ...contract, policyKey: 'old' } })).toBe(false)
    contract.audiences.SUBJECT = { ...contract.audiences.RESPONDENT }
    expect(() => assertSelfGroupOwnSummaryCeiling({ approved, proposed: contract })).toThrow('SELF_GROUP_OWN_SUMMARY_WIDENED')
    contract.audiences.SUBJECT = testDisclosure().audiences.SUBJECT
    contract.audiences.RESPONDENT.longitudinalMetricKeys = ['dimension']
    expect(() => assertSelfGroupOwnSummaryCeiling({ approved, proposed: contract })).toThrow()
  })

  it('binds the chosen frozen leaf, keeps container swaps in one disclosure identity and separates real measurement changes', () => {
    const core: CanonicalUnitResultCoreV1 = { schemaVersion: 1, unitType: 'COGNITIVE', instrumentKey: 'attention', instrumentVersion: '1.0.0',
      sourceDefinitionHash: 'a'.repeat(64), compilerVersion: '1', compiledRuntimeHash: 'b'.repeat(64), scorerKey: 'attention', scorerVersion: '1',
      quality: { status: 'interpretable', flags: [] }, metrics: [{ key: 'score', value: 0, unit: 'ms' }], facts: [], references: [], contextHash: null,
      scientificProvenance: { instrumentKey: 'attention', instrumentVersion: '1.0.0', protocolSignature: 'formal', profileKey: 'research', resolvedConfigHash: 'c'.repeat(64) } }
    const leaf = { slotKey: 'slot-a', unitType: core.unitType, instrumentKey: core.instrumentKey, instrumentVersion: core.instrumentVersion, compiledRuntimeHash: core.compiledRuntimeHash }
    const parent = { resourceKind: 'BUNDLE' as const, resourceKey: 'bundle-a', resourceVersion: '2.0.0', entryHash: 'd'.repeat(64) }
    const resolved = resolveSelfGroupLeafIdentity({ parent, leaf, core })
    expect(resolveSelfGroupLeafIdentity({ parent: { ...parent, resourceKey: 'bundle-b' }, leaf: { ...leaf, slotKey: 'other-slot' }, core }).disclosureIdentityHash).toBe(resolved.disclosureIdentityHash)
    expect(resolveSelfGroupLeafIdentity({ parent, leaf, core: { ...core, metrics: [{ key: 'score', value: 999, unit: 'ms' }] } }).disclosureIdentityHash).toBe(resolved.disclosureIdentityHash)
    expect(resolveSelfGroupLeafIdentity({ parent, leaf, core: { ...core, scientificProvenance: { ...core.scientificProvenance, profileKey: 'experience' } } }).disclosureIdentityHash).not.toBe(resolved.disclosureIdentityHash)
    expect(resolveSelfGroupLeafIdentity({ parent, leaf, core: { ...core, metrics: [{ key: 'score', value: 0, unit: '%' }] } }).disclosureIdentityHash).not.toBe(resolved.disclosureIdentityHash)
    expect(() => resolveSelfGroupLeafIdentity({ parent, leaf: { ...leaf, instrumentKey: 'other-with-same-score-key' }, core })).toThrow('SELF_GROUP_LEAF_IDENTITY_MISMATCH')
  })
})
