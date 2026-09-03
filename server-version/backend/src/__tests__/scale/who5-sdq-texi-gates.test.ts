import { describe, expect, it } from 'vitest'
import {
  SDQ_PARENT_OBSERVER_ZH_CN_V1,
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
  TEXI_LOCALIZATION_MANIFEST_BLOCKED,
  isTexiLocalizationManifestSigned,
} from '../../modules/scale/localization/texi-localization-manifest'
import {
  evaluateSdqElectronicAdminGate,
  evaluateTexiLocalizationGate,
  evaluateWho5ScalePackageGate,
} from '../../modules/scale/scale-package-gates'
import { getScalePackage, validateScalePackage } from '../../modules/scale/scale-package.registry'
import { scoreScale } from '../../modules/scale/scale-scoring'

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

  it('blocks SDQ/TEXI packages instead of inventing item text', () => {
    expect(BLOCKED_SCALE_PACKAGES_V1).toHaveLength(4)
    expect(getScalePackage('sdq_parent_zh_cn', '1.0.0')).toBeUndefined()
    expect(getBlockedScalePackage('sdq_parent_zh_cn', '1.0.0')?.releaseStatus).toBe('BLOCKED')
    expect(getBlockedScalePackage('texi_parent_zh_cn', '1.0.0')?.releaseStatus).toBe('BLOCKED')

    const sdqGate = evaluateSdqElectronicAdminGate({
      instrumentKey: 'sdq_parent_zh_cn',
      instrumentVersion: '1.0.0',
      authorizations: [],
      locale: 'zh-CN',
      territory: 'CN',
    })
    expect(sdqGate.publishable).toBe(false)
    expect(sdqGate.blocked).toBe(true)
    expect(sdqGate.errors.some((row) => /electronic|authorization|BLOCKED/i.test(row))).toBe(true)

    expect(isTexiLocalizationManifestSigned(TEXI_LOCALIZATION_MANIFEST_BLOCKED)).toBe(false)
    const texiGate = evaluateTexiLocalizationGate({
      instrumentKey: 'texi_parent_zh_cn',
      instrumentVersion: '1.0.0',
      localizationManifest: TEXI_LOCALIZATION_MANIFEST_BLOCKED,
    })
    expect(texiGate.publishable).toBe(false)
    expect(texiGate.blocked).toBe(true)

    expect(SDQ_PARENT_OBSERVER_ZH_CN_V1.status).toBe('DRAFT')
    expect(TEXI_PARENT_OBSERVER_ZH_CN_V1.population.subjectMinAgeYears).toBe(13)
    expect(TEXI_PARENT_OBSERVER_ZH_CN_V1.population.subjectMaxAgeYears).toBe(19)
    expect(SDQ_PARENT_OBSERVER_ZH_CN_V1.limitations.some((row) => /BLOCKED|not fabricated/i.test(row))).toBe(true)
  })
})
