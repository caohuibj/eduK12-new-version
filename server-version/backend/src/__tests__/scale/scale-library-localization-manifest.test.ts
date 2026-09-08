import { describe, expect, it } from 'vitest'
import { parseLocalizationManifest } from '../../modules/scale/library/localization-manifest'

const validManifest = () => ({
  schemaVersion: 1 as const,
  instrumentKey: 'who5',
  instrumentVersion: '1.0.0',
  sourceLocale: 'en',
  targetLocale: 'zh-CN',
  localizationVersion: '1.0.0',
  translationSource: 'WHO 官方 Chinese PR PDF（授权转录）',
  adaptationMethod: 'DIRECT_TRANSLATION' as const,
  expertReviewStatus: 'COMPLETED' as const,
  cognitiveDebriefStatus: 'NOT_ESTABLISHED' as const,
  localEvidenceRefs: [],
  reviewStatus: 'APPROVED' as const,
  reviewedAt: '2026-09-01T00:00:00.000Z',
})

describe('LocalizationManifestV1 (SL2-C1)', () => {
  it('parses a valid manifest with PILOT-level incomplete psychometric evidence', () => {
    const result = parseLocalizationManifest(validManifest())
    expect(result.ok).toBe(true)
    if (result.ok) {
      // 缺少本地 psychometric validation ≠ manifest invalid（§9）
      expect(result.manifest.cognitiveDebriefStatus).toBe('NOT_ESTABLISHED')
      expect(result.manifest.localEvidenceRefs).toEqual([])
    }
  })

  it('rejects a wrong instrument key or version format', () => {
    expect(parseLocalizationManifest({ ...validManifest(), instrumentKey: 'WHO5' }).ok).toBe(false)
    expect(parseLocalizationManifest({ ...validManifest(), instrumentVersion: 'v1' }).ok).toBe(false)
  })

  it('rejects invalid source or target locales', () => {
    expect(parseLocalizationManifest({ ...validManifest(), sourceLocale: 'english' }).ok).toBe(false)
    expect(parseLocalizationManifest({ ...validManifest(), targetLocale: 'zh_CN' }).ok).toBe(false)
  })

  it('rejects an invalid localizationVersion', () => {
    expect(parseLocalizationManifest({ ...validManifest(), localizationVersion: '1.0' }).ok).toBe(false)
  })

  it('rejects a manifest missing required provenance (translationSource)', () => {
    const manifest = validManifest()
    delete (manifest as { translationSource?: string }).translationSource
    const result = parseLocalizationManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('translationSource 必填'))).toBe(true)
  })

  it('rejects a generic rights-like field so rights cannot be duplicated in localization provenance', () => {
    const result = parseLocalizationManifest({ ...validManifest(), translationRightsStatus: 'DENIED' })
    expect(result.ok).toBe(false)
  })

  it('rejects a malformed manifest (strict fields, bad schemaVersion, missing review fields)', () => {
    expect(parseLocalizationManifest({ ...validManifest(), isLicensed: true }).ok).toBe(false)
    expect(parseLocalizationManifest({ ...validManifest(), schemaVersion: 2 }).ok).toBe(false)
    expect(parseLocalizationManifest({ ...validManifest(), expertReviewStatus: 'MAGIC' }).ok).toBe(false)
  })

  it('requires reviewedAt when reviewStatus is APPROVED', () => {
    const manifest = validManifest()
    delete (manifest as { reviewedAt?: string }).reviewedAt
    const result = parseLocalizationManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('reviewedAt'))).toBe(true)
  })

  it('rejects a same-locale manifest that claims translation instead of original source', () => {
    const result = parseLocalizationManifest({
      ...validManifest(),
      sourceLocale: 'zh-CN',
      targetLocale: 'zh-CN',
      adaptationMethod: 'DIRECT_TRANSLATION',
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('ORIGINAL_SOURCE'))).toBe(true)
  })

  it('allows a same-locale original-source deployment (official language publication)', () => {
    const result = parseLocalizationManifest({
      ...validManifest(),
      sourceLocale: 'zh-CN',
      targetLocale: 'zh-CN',
      adaptationMethod: 'ORIGINAL_SOURCE',
      translationSource: 'WHO 官方 Chinese PR PDF（原文部署）',
    })
    expect(result.ok).toBe(true)
  })
})
