import {afterAll,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {localizationManifestV1Schema, parseLocalizationManifest} from '../../modules/scale/library/localization-manifest'
import {scaleLocalizationReasons} from '../../modules/scale/policy/localization'
import {previewScaleInstrument} from '../../modules/scale/onboarding/preview'
import type {ScaleInstrumentSourceV1} from '../../modules/scale/onboarding/types'

const policy = { schemaVersion: 2, revision: 1, locale: 'zh-CN', territory: 'CN', deploymentModes: ['STANDALONE' as const], runtimePolicyHash: 'a'.repeat(64), localizationVersion: '1.0.0', inFlightCompletion: 'FROZEN_DEADLINE' as const }

import { GENERATED_SCALE_INSTRUMENT_SOURCES } from '../../modules/scale/onboarding/instruments.generated'

const baseSource = structuredClone(GENERATED_SCALE_INSTRUMENT_SOURCES[0])
const sourceWith = (over: Record<string, unknown>): ScaleInstrumentSourceV1 => ({
  ...baseSource,
  localization: {
    ...baseSource.localization!,
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    localizationVersion: '1.0.0',
    adaptationMethod: 'DIRECT_TRANSLATION',
    expertReviewStatus: 'PENDING',
    reviewStatus: 'PENDING',
    ...(over.localization as Record<string, unknown> | undefined ?? {}),
  },
  ...over,
} as unknown as ScaleInstrumentSourceV1)

afterAll(async () => { await prisma.$disconnect() })

describe('pending-audit content: review states, evidence records and next actions', () => {
  it('imports and previews a PENDING translation while blocking deployment with located reasons', () => {
    const preview = previewScaleInstrument({ source: sourceWith({}), locale: 'zh-CN', territory: 'CN', deploymentModes: ['STANDALONE'] })
    // Import/preview works for pending content; only activation is blocked.
    expect(preview.blockers).toContain('LOCALIZATION_REVIEW_PENDING')
    expect(preview.blockers).toContain('LOCALIZATION_EXPERT_REVIEW_PENDING')
    expect(preview.allowActivation).toBe(false)
    const reasons = scaleLocalizationReasons(sourceWith({}), policy)
    expect(reasons).toEqual(expect.arrayContaining(['LOCALIZATION_REVIEW_PENDING', 'LOCALIZATION_EXPERT_REVIEW_PENDING']))
  })

  it('separates RETURNED from PENDING with revision guidance', () => {
    const returned = sourceWith({ localization: { ...sourceWith({}).localization, sourceLocale: 'en', adaptationMethod: 'DIRECT_TRANSLATION', reviewStatus: 'RETURNED', review: { reviewer: '审校人', reviewedAt: '2026-10-26T00:00:00Z', instrumentVersion: '1.0.0', localizationVersion: '1.0.0', evidenceIds: ['ev-1'], reason: '第3题译文与锚点不符' } } })
    expect(scaleLocalizationReasons(returned, policy)).toContain('LOCALIZATION_REVIEW_RETURNED')
    const preview = previewScaleInstrument({ source: returned, locale: 'zh-CN', territory: 'CN', deploymentModes: ['STANDALONE'] })
    const action = preview.nextActions.find(a => a.code === 'LOCALIZATION_REVIEW_RETURNED')
    expect(action?.next).toContain('再次送审')
    // RETURNED without a reason is invalid at parse time.
    const noReason = localizationManifestV1Schema.safeParse({ ...(returned.localization as Record<string, unknown>), review: { reviewer: '审校人', reviewedAt: '2026-10-26T00:00:00Z', instrumentVersion: '1.0.0', localizationVersion: '1.0.0', evidenceIds: ['ev-1'] } })
    expect(noReason.success).toBe(false)
  })

  it('rejects reusing an old review record after a version change', () => {
    const parsed = parseLocalizationManifest({
      schemaVersion: 1, instrumentKey: 'synthetic_pending_v1', instrumentVersion: '1.0.0',
      sourceLocale: 'en', targetLocale: 'zh-CN', localizationVersion: '2.0.0',
      translationSource: '修订译稿', adaptationMethod: 'DIRECT_TRANSLATION',
      expertReviewStatus: 'COMPLETED', cognitiveDebriefStatus: 'NOT_ESTABLISHED', localEvidenceRefs: [],
      reviewStatus: 'APPROVED', reviewedAt: '2026-10-26T00:00:00Z',
      // Record still claims the old localization version: reuse must fail loudly.
      review: { reviewer: '审校人', reviewedAt: '2026-10-20T00:00:00Z', instrumentVersion: '1.0.0', localizationVersion: '1.0.0', evidenceIds: ['ev-1'] },
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.ok ? [] : parsed.issues.map(i => i.message).join('|')).toContain('REVIEW_RECORD_VERSION_MISMATCH')
  })

  it('keeps the three legacy states deployable/regressable: approved formal translation, original source, pending draft', () => {
    const formal = sourceWith({ localization: { ...sourceWith({}).localization, sourceLocale: 'en', adaptationMethod: 'DIRECT_TRANSLATION', reviewStatus: 'APPROVED', reviewedAt: '2026-10-01T00:00:00Z', expertReviewStatus: 'COMPLETED' } })
    const formalReasons = scaleLocalizationReasons(formal, policy)
    expect(formalReasons).toEqual([])
    const original = sourceWith({ localization: { ...sourceWith({}).localization, reviewStatus: 'APPROVED', reviewedAt: '2026-10-01T00:00:00Z', adaptationMethod: 'ORIGINAL_SOURCE', sourceLocale: 'zh-CN', expertReviewStatus: 'NOT_ESTABLISHED' } })
    expect(scaleLocalizationReasons(original, policy)).toEqual([])
    // A legacy APPROVED manifest without a review record stays valid (first generation).
    const legacy = sourceWith({ localization: { ...sourceWith({}).localization, reviewStatus: 'APPROVED', reviewedAt: '2026-10-01T00:00:00Z' } })
    const legacyParsed = parseLocalizationManifest({ ...(structuredClone(legacy.localization) as Record<string, unknown>), instrumentKey: legacy.identity.instrumentKey, instrumentVersion: legacy.identity.instrumentVersion })
    expect(legacyParsed.ok ? [] : legacyParsed.issues).toEqual([])
  })

  it('an evidence-carrying approval passes parse when versions match', () => {
    const parsed = parseLocalizationManifest({
      schemaVersion: 1, instrumentKey: 'synthetic_pending_v1', instrumentVersion: '1.0.0',
      sourceLocale: 'en', targetLocale: 'zh-CN', localizationVersion: '1.0.0',
      translationSource: '定稿译稿', adaptationMethod: 'BACK_TRANSLATION_VERIFIED',
      expertReviewStatus: 'COMPLETED', cognitiveDebriefStatus: 'NOT_ESTABLISHED', localEvidenceRefs: ['ev-1'],
      reviewStatus: 'APPROVED', reviewedAt: '2026-10-26T00:00:00Z',
      review: { reviewer: '治理审核人', reviewedAt: '2026-10-26T00:00:00Z', instrumentVersion: '1.0.0', localizationVersion: '1.0.0', evidenceIds: ['ev-1', 'ev-2'] },
      expertReview: { reviewer: '专家审校人', reviewedAt: '2026-10-25T00:00:00Z', instrumentVersion: '1.0.0', localizationVersion: '1.0.0', evidenceIds: ['ev-3'] },
    })
    expect(parsed.ok).toBe(true)
  })
})

describe('standard onboarding status view', () => {
  it('reports distinct lifecycle states with next actions and never merges import with publication', async () => {
    const { listStandardOnboardingStatus } = await import('../../modules/scale/onboarding/status')
    const { list } = await listStandardOnboardingStatus(prisma)
    expect(list.length).toBeGreaterThan(0)
    for (const entry of list) {
      expect(entry.states.imported).toBe(true)
      expect(typeof entry.stage).toBe('string')
      // Every blocker carries a located next action or is explicitly listed.
      for (const code of entry.blockers) {
        if (code.includes('LOCALIZATION') || ['SYSTEM_ADMIN_REQUIRED', 'DEPLOYMENT_BINDING_MISSING'].includes(code)) {
          expect(entry.nextActions.some(a => a.code === code)).toBe(true)
        }
      }
      // 已导入待部署 is distinct from 已发布; a published row without an
      // active deployment still reads as published, never as merely imported.
      if (!entry.states.deployed && !entry.states.published) expect(entry.stage).toBe('已导入待部署')
    }
  })
})
