import { describe, expect, it } from 'vitest'
import { approveInstrumentAuthorization, createInstrumentAuthorizationDraft } from '../../modules/assessment-authorization'
import { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy, getScaleInstrumentLocalization } from '../../modules/scale/onboarding/instrument-registry'
import { evaluateScaleDeployment, type ScaleDeploymentPolicyV1 } from '../../modules/scale/policy/deployment'
import { scaleLocalizationReasons } from '../../modules/scale/policy/localization'
import { getScalePackage, validateScalePackage } from '../../modules/scale/scale-package.registry'
import { scoreScale } from '../../modules/scale/scale-scoring'

const authorization = (key: string, locale: string) => approveInstrumentAuthorization({
  record: createInstrumentAuthorizationDraft({
    instrumentKey: key, instrumentVersion: '1.0.0', grantor: 'test', grantee: 'eduK12',
    scope: { electronicAdministration: true, scoring: true, translation: true, display: true, territories: ['CN'], locales: [locale], commercialNature: 'NON_COMMERCIAL' },
    validFrom: '2026-01-01T00:00:00.000Z', validTo: '2027-01-01T00:00:00.000Z', basis: 'test', createdByUserId: 'admin-1',
  }),
  actorUserId: 'admin-2',
}).record

const policy = (key: string, locale: string, commercialNature: 'NON_COMMERCIAL' | 'COMMERCIAL' = 'NON_COMMERCIAL'): ScaleDeploymentPolicyV1 => {
  const runtime = getScaleInstrumentRuntimePolicy(key, '1.0.0')!
  const localization = getScaleInstrumentLocalization(key, '1.0.0')!
  return {
    schemaVersion: 1, revision: 1, locale, territory: 'CN', deploymentModes: ['STANDALONE'],
    commercialNature, requiredRightsActions: ['electronicAdministration', 'scoring', 'display'],
    authorizationRefs: ['auth'], runtimePolicyHash: runtime.runtimePolicyHash,
    localizationVersion: localization.localizationVersion, inFlightCompletion: 'FROZEN_DEADLINE',
  }
}

describe('migrated WHO-5 / SDQ / TEXI source restrictions', () => {
  it('preserves WHO-5 items/scoring and expresses non-commercial use in generic source policy', () => {
    const pkg = getScalePackage('who5', '1.0.0')!
    expect(validateScalePackage(pkg).valid).toBe(true)
    expect(pkg.definition.items).toHaveLength(5)
    const scored = scoreScale(pkg.definition, pkg.definition.items.map(item => ({ itemCode: item.itemCode, responseValue: 'more_than_half' })))
    expect(scored.scores.find(row => row.key === 'percentage')?.value).toBe(60)
    const source = getScaleInstrumentSource('who5', '1.0.0')!
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL'])
    const auth = { ...authorization('who5', 'zh-CN'), authorizationId: 'auth' }
    const runtime = getScaleInstrumentRuntimePolicy('who5', '1.0.0')!
    expect(evaluateScaleDeployment({ policy: policy('who5', 'zh-CN'), requestedMode: 'STANDALONE', instrumentKey: 'who5', instrumentVersion: '1.0.0', compiledRuntimePolicyHash: runtime.runtimePolicyHash, authorizations: [auth], usageRequirements: runtime.usageRequirements }).allowNewStarts).toBe(true)
    expect(evaluateScaleDeployment({ policy: policy('who5', 'zh-CN', 'COMMERCIAL'), requestedMode: 'STANDALONE', instrumentKey: 'who5', instrumentVersion: '1.0.0', compiledRuntimePolicyHash: runtime.runtimePolicyHash, authorizations: [auth], usageRequirements: runtime.usageRequirements }).reasons).toContain('COMMERCIAL_NATURE_NOT_ALLOWED')
  })

  it('preserves SDQ executable content while generic source policy requires rights and exact locale', () => {
    const parent = getScalePackage('sdq_parent_zh_cn', '1.0.0')!
    expect(validateScalePackage(parent).valid).toBe(true)
    expect(parent.definition.items).toHaveLength(25)
    const parentRuntime = getScaleInstrumentRuntimePolicy('sdq_parent_zh_cn', '1.0.0')!
    expect(evaluateScaleDeployment({ policy: policy('sdq_parent_zh_cn', 'zh-CN'), requestedMode: 'STANDALONE', instrumentKey: 'sdq_parent_zh_cn', instrumentVersion: '1.0.0', compiledRuntimePolicyHash: parentRuntime.runtimePolicyHash, authorizations: [], usageRequirements: parentRuntime.usageRequirements }).allowNewStarts).toBe(false)
    const teacherSource = getScaleInstrumentSource('sdq_teacher_zh_cn', '1.0.0')!
    expect(teacherSource.executable?.contentLocale).toBe('en')
    expect(scaleLocalizationReasons(teacherSource, policy('sdq_teacher_zh_cn', 'zh-CN'))).toContain('DEPLOYMENT_CONTENT_LOCALE_MISMATCH')
  })

  it('preserves TEXI scoring and fails closed through generic PENDING localization', () => {
    const pkg = getScalePackage('texi_parent_zh_cn', '1.0.0')!
    expect(validateScalePackage(pkg).valid).toBe(true)
    const scored = scoreScale(pkg.definition, pkg.definition.items.map(item => ({ itemCode: item.itemCode, responseValue: '3' })))
    expect(scored.scores.find(row => row.key === 'working_memory')?.value).toBe(3)
    const source = getScaleInstrumentSource('texi_parent_zh_cn', '1.0.0')!
    expect(source.localization?.reviewStatus).toBe('PENDING')
    expect(scaleLocalizationReasons(source, policy('texi_parent_zh_cn', 'en'))).toContain('LOCALIZATION_REVIEW_PENDING')
  })
})
