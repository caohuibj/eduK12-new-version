import { describe, expect, it } from 'vitest'
import {
  SDQ_PARENT_OBSERVER_ZH_CN_V1,
  SDQ_TEACHER_OBSERVER_ZH_CN_V1,
  TEXI_PARENT_OBSERVER_ZH_CN_V1,
  WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
} from '../../modules/assessment-bundle'
import {
  approveInstrumentAuthorization,
  createInstrumentAuthorizationDraft,
} from '../../modules/assessment-authorization'
import {
  BLOCKED_SCALE_PACKAGES_V1,
  getBlockedScalePackage,
} from '../../modules/scale/packages/blocked-observer-packages'
import {
  TEXI_LOCALIZATION_MANIFEST_PENDING,
  isTexiLocalizationManifestSigned,
} from '../../modules/scale/localization/texi-localization-manifest'
import {
  evaluateSdqElectronicAdminGate,
  evaluateTexiLocalizationGate,
  evaluateWho5ScalePackageGate,
} from '../../modules/scale/scale-package-gates'
import { getScalePackage, validateScalePackage } from '../../modules/scale/scale-package.registry'
import { scoreScale } from '../../modules/scale/scale-scoring'

const approveSdq = (key: string) => {
  const draft = createInstrumentAuthorizationDraft({
    instrumentKey: key,
    instrumentVersion: '1.0.0',
    grantor: 'Youthinmind / Goodman SDQ license path',
    grantee: 'eduK12',
    scope: {
      electronicAdministration: true,
      scoring: true,
      translation: true,
      display: true,
      territories: ['CN'],
      locales: ['zh-CN', 'en'],
      commercialNature: 'NON_COMMERCIAL',
    },
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    basis: 'User-authorized electronic use of official source PDFs',
    createdByUserId: 'admin-1',
  })
  return approveInstrumentAuthorization({
    record: draft,
    actorUserId: 'admin-2',
  }).record
}

describe('WHO-5 / SDQ / TEXI scale packages and gates', () => {
  it('lands WHO-5 official Chinese PR items and golden scoring', () => {
    const pkg = getScalePackage('who5', '1.0.0')
    expect(pkg).toBeTruthy()
    expect(pkg!.definition.items).toHaveLength(5)
    expect(pkg!.definition.items.map((item) => item.content)).toEqual([
      '我感觉快乐、心情舒畅',
      '我感觉宁静和放松',
      '我感觉充满活力、精力充沛',
      '我睡醒时感到清新、得到了足够休息',
      '我每天生活充满了有趣的事情',
    ])
    const validation = validateScalePackage(pkg!)
    expect(validation.valid).toBe(true)

    const scored = scoreScale(pkg!.definition, pkg!.definition.items.map((item) => ({
      itemCode: item.itemCode,
      responseValue: 'more_than_half',
    })))
    expect(scored.quality.status).toBe('interpretable')
    expect(scored.scores.find((row) => row.key === 'raw_total')?.value).toBe(15)
    expect(scored.scores.find((row) => row.key === 'percentage')?.value).toBe(60)
  })

  it('keeps WHO-5 publish gate non-commercial and authorization-bound', () => {
    const draft = createInstrumentAuthorizationDraft({
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      grantor: 'WHO',
      grantee: 'eduK12',
      scope: {
        electronicAdministration: true,
        scoring: true,
        translation: true,
        display: true,
        territories: ['CN'],
        locales: ['zh-CN'],
        commercialNature: 'NON_COMMERCIAL',
      },
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2027-01-01T00:00:00.000Z',
      basis: 'WHO-5 CC BY-NC-SA',
      createdByUserId: 'admin-1',
    })
    const approved = approveInstrumentAuthorization({
      record: draft,
      actorUserId: 'admin-2',
    }).record
    const ok = evaluateWho5ScalePackageGate({
      authorizations: [approved],
      deploymentCommercialNature: 'NON_COMMERCIAL',
      locale: 'zh-CN',
      territory: 'CN',
    })
    expect(ok.publishable).toBe(true)
    const blockedCommercial = evaluateWho5ScalePackageGate({
      authorizations: [approved],
      deploymentCommercialNature: 'COMMERCIAL',
      locale: 'zh-CN',
      territory: 'CN',
    })
    expect(blockedCommercial.publishable).toBe(false)
    expect(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1.publicationRequirements.nonCommercialOnly).toBe(true)
  })

  it('lands SDQ parent zh-Hans items with Goodman scoring and auth gate', () => {
    const pkg = getScalePackage('sdq_parent_zh_cn', '1.0.0')
    expect(pkg).toBeTruthy()
    expect(pkg!.definition.items).toHaveLength(25)
    expect(pkg!.definition.responseSets[0].options.map((o) => o.label)).toEqual([
      '不真实',
      '有点真实',
      '完全真实',
    ])
    expect(pkg!.definition.items[0].content).toBe('能体谅到别人的感受')
    expect(pkg!.definition.items[24].content).toBe('做事情能做到底，注意力持久')
    const validation = validateScalePackage(pkg!)
    expect(validation.valid).toBe(true)

    const scored = scoreScale(
      pkg!.definition,
      pkg!.definition.items.map((item) => ({ itemCode: item.itemCode, responseValue: 'somewhat_true' })),
    )
    expect(scored.quality.status).toBe('interpretable')
    expect(scored.scores.find((row) => row.key === 'total_difficulties')?.value).toBe(20)

    const denied = evaluateSdqElectronicAdminGate({
      instrumentKey: 'sdq_parent_zh_cn',
      instrumentVersion: '1.0.0',
      authorizations: [],
      locale: 'zh-CN',
      territory: 'CN',
    })
    expect(denied.publishable).toBe(false)
    expect(denied.errors.some((row) => /electronic|authorization/i.test(row))).toBe(true)

    const approved = approveSdq('sdq_parent_zh_cn')
    const ok = evaluateSdqElectronicAdminGate({
      instrumentKey: 'sdq_parent_zh_cn',
      instrumentVersion: '1.0.0',
      authorizations: [approved],
      locale: 'zh-CN',
      territory: 'CN',
    })
    expect(ok.publishable).toBe(true)
    expect(SDQ_PARENT_OBSERVER_ZH_CN_V1.status).toBe('DRAFT')
    expect(SDQ_PARENT_OBSERVER_ZH_CN_V1.population.subjectMinAgeYears).toBe(4)
  })

  it('locks SDQ teacher English T4-10 and keeps zh-CN translation blocked', () => {
    const pkg = getScalePackage('sdq_teacher_zh_cn', '1.0.0')
    expect(pkg).toBeTruthy()
    expect(pkg!.definition.items.some((row) => row.itemCode === 'SDQ-IMPACT-OVERALL')).toBe(true)
    expect(pkg!.definition.scoring.scorerKey).toBe('sdq.teacher.t4_10.v1')
    expect(pkg!.definition.items[0].content).toContain("Considerate of other people's feelings")
    expect(pkg!.definition.responseSets[0].options.map((o) => o.label)).toEqual([
      'Not True',
      'Somewhat True',
      'Certainly True',
    ])
    expect(validateScalePackage(pkg!).valid).toBe(true)

    const approved = approveSdq('sdq_teacher_zh_cn')
    const zhBlocked = evaluateSdqElectronicAdminGate({
      instrumentKey: 'sdq_teacher_zh_cn',
      instrumentVersion: '1.0.0',
      authorizations: [approved],
      locale: 'zh-CN',
      territory: 'CN',
    })
    expect(zhBlocked.publishable).toBe(false)
    expect(zhBlocked.errors.some((row) => /translation pending|PENDING/i.test(row))).toBe(true)

    const enOk = evaluateSdqElectronicAdminGate({
      instrumentKey: 'sdq_teacher_zh_cn',
      instrumentVersion: '1.0.0',
      authorizations: [approved],
      locale: 'en',
      territory: 'CN',
    })
    expect(enOk.publishable).toBe(true)
    expect(SDQ_TEACHER_OBSERVER_ZH_CN_V1.population.subjectMaxAgeYears).toBe(10)
    expect(getBlockedScalePackage('sdq_teacher_zh_cn', '1.0.0')?.reasons).toContain(
      'ZH_CN_TRANSLATION_PENDING_SIGNED_MANIFEST',
    )
  })

  it('locks TEXI English items and keeps unsigned localization fail-closed', () => {
    expect(BLOCKED_SCALE_PACKAGES_V1).toHaveLength(4)
    const parent = getScalePackage('texi_parent_zh_cn', '1.0.0')
    const teacher = getScalePackage('texi_teacher_zh_cn', '1.0.0')
    expect(parent).toBeTruthy()
    expect(teacher).toBeTruthy()
    expect(parent!.definition.items).toHaveLength(20)
    expect(parent!.definition.responseSets[0].options.map((o) => o.label)).toEqual([
      'Definitely not true',
      'Not true',
      'Partially true',
      'True',
      'Definitely true',
    ])
    expect(validateScalePackage(parent!).valid).toBe(true)
    expect(validateScalePackage(teacher!).valid).toBe(true)

    const scored = scoreScale(
      parent!.definition,
      parent!.definition.items.map((item) => ({ itemCode: item.itemCode, responseValue: '3' })),
    )
    expect(scored.scores.find((row) => row.key === 'working_memory')?.value).toBe(3)
    expect(scored.scores.find((row) => row.key === 'inhibition')?.value).toBe(3)
    expect(parent!.definition.scoring.scores.find((s) => s.key === 'working_memory')?.source).toMatchObject({
      type: 'items',
    })
    const wmItems = (parent!.definition.scoring.scores.find((s) => s.key === 'working_memory')!.source as { items: Array<{ itemCode: string }> }).items.map((i) => i.itemCode)
    expect(wmItems).toContain('TEXI-13')
    const inhItems = (parent!.definition.scoring.scores.find((s) => s.key === 'inhibition')!.source as { items: Array<{ itemCode: string }> }).items.map((i) => i.itemCode)
    expect(inhItems).not.toContain('TEXI-13')

    expect(isTexiLocalizationManifestSigned(TEXI_LOCALIZATION_MANIFEST_PENDING)).toBe(false)
    expect(TEXI_LOCALIZATION_MANIFEST_PENDING.itemCodes).toHaveLength(20)
    const texiGate = evaluateTexiLocalizationGate({
      instrumentKey: 'texi_parent_zh_cn',
      instrumentVersion: '1.0.0',
      localizationManifest: TEXI_LOCALIZATION_MANIFEST_PENDING,
    })
    expect(texiGate.publishable).toBe(false)
    expect(texiGate.blocked).toBe(true)
    expect(TEXI_PARENT_OBSERVER_ZH_CN_V1.population.subjectMinAgeYears).toBe(13)
    expect(TEXI_PARENT_OBSERVER_ZH_CN_V1.population.subjectMaxAgeYears).toBe(19)
  })
})
