import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as original } from '../../../modules/scale/instruments/ars30_2016_zh_cn_research/1.0.0/instrument'
import {
  SCALE_INSTRUMENT_REGISTRY,
  getScaleInstrumentRuntimePolicy,
  getScaleInstrumentSource,
  getScaleInstrumentValidation,
  resolveFrozenScaleInstructionForScale,
} from '../../../modules/scale/onboarding/instrument-registry'
import { installScaleInstrument, planScaleInstrumentInstall } from '../../../modules/scale/onboarding/install'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'
import { scaleInstrumentSourceV1Schema } from '../../../modules/scale/onboarding/schema'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'

const identity = { instrumentKey: 'ars30_2016_zh_cn_research', instrumentVersion: '1.0.0' }
const selected = () => getScaleInstrumentSource(identity.instrumentKey, identity.instrumentVersion)!

describe('ARS-30 fixed-source registration on main admission mechanism', () => {
  it('resolves the original three-part contract through the generated registry with truthful manual states', () => {
    const source = selected()
    expect(source).toEqual(scaleInstrumentSourceV1Schema.parse(original))
    expect(SCALE_INSTRUMENT_REGISTRY.listDiagnostics().filter(row => row.instrumentKey === identity.instrumentKey)).toEqual([])
    expect(getScaleInstrumentValidation(identity.instrumentKey, identity.instrumentVersion)).toEqual({ valid: true, issues: [] })
    const pkg = SCALE_INSTRUMENT_REGISTRY.getExecutable(identity.instrumentKey, identity.instrumentVersion)!
    expect(pkg.definition.items).toHaveLength(30)
    expect(pkg.definition.scoring.scoringVersion).toBe('1.0.0')
    expect(pkg.definition.report.reportVersion).toBe('1.0.0')
    expect(pkg.definition.report.audienceContract).toMatchObject({ locale: 'zh-CN', audience: 'student', respondent: 'ADULT_SELF' })
    expect(pkg.definition.referencePolicy).toEqual({ type: 'none' })
    expect(pkg.references).toEqual([])
    expect(getScaleInstrumentRuntimePolicy(identity.instrumentKey, identity.instrumentVersion)).toMatchObject({ contentLocale: 'zh-CN' })
    const frozen = resolveFrozenScaleInstructionForScale({ code: identity.instrumentKey, instrumentVersion: identity.instrumentVersion, instrumentClass: 'STANDARD', instruction: 'synthetic stale row text' })
    expect(frozen).toEqual({ text: source.instruction!.text, language: 'zh-CN', version: '1.0.0', origin: 'INSTRUMENT_SOURCE' })
    const preview = previewScaleInstrument({ ...identity, locale: 'zh-CN', territory: 'CN', deploymentModes: ['STANDALONE'] })
    expect(preview.sourceValidation.ok).toBe(true)
    expect(preview.blockers).toEqual(['EXECUTABLE_NOT_PUBLISHED'])
    expect(preview.manualReview.localization).toEqual(['LOCALIZATION_REVIEW_PENDING', 'LOCALIZATION_EXPERT_REVIEW_PENDING'])
    expect(preview.manualReview.scientific.researchReady.eligible).toBe(false)
    expect(source.scientificReview).toBeUndefined()
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.executable!.releaseStatus).toBe('DRAFT')
  })

  it('consumes complete and incomplete registered answers through the existing result protocol without inventing thresholds', () => {
    const source = selected()
    const definition = source.executable!.definition
    const answers = definition.items.map(item => ({ itemCode: item.itemCode, responseValue: '3' }))
    const build = (selectedAnswers: typeof answers) => parseScaleResultV2(buildScaleResult({
      scaleId: 'synthetic-ars30-registration', ...identity, name: source.catalog.identity.canonicalName, definition, answers: selectedAnswers,
    }))
    const complete = build(answers)
    expect(Object.fromEntries(complete.scores.map(score => [score.key, score.value]))).toEqual({
      total: 90, perseverance: 42, reflection_help_seeking: 27, adaptive_emotional_response: 21,
    })
    expect(complete.interpretations.map(entry => entry.scoreKey)).toEqual(definition.report.scoreOrder)
    for (const entry of complete.interpretations) {
      expect(entry.interpretation).toBe(definition.report.interpretations.find(row => row.scoreKey === entry.scoreKey)!.summary)
      expect(entry.label).toBeNull()
      expect(entry.referenceVersion).toBeNull()
    }
    const incomplete = build(answers.slice(1))
    expect(incomplete.quality.status).toBe('invalid')
    expect(incomplete.scores.find(score => score.key === 'total')!.value).toBeNull()
    expect(incomplete.scores.find(score => score.key === 'perseverance')!.value).toBeNull()
    expect(incomplete.scores.find(score => score.key === 'reflection_help_seeking')!.value).toBe(27)
    expect(incomplete.interpretations).toEqual([])
  })

  it('keeps source registration distinct from installation and rejects DRAFT activation before writes', async () => {
    const create = vi.fn(), transaction = vi.fn()
    // Deliberately in-memory read doubles: this is not PostgreSQL installation.
    const db = {
      user: { findUnique: async () => ({ id: 'synthetic-admin', platformRole: 'SYSTEM_ADMIN', isActive: true, isFrozen: false, expiresAt: null }) },
      scale: { findUnique: async () => null, create },
      $transaction: transaction,
    } as unknown as PrismaClient
    const policy = getScaleInstrumentRuntimePolicy(identity.instrumentKey, identity.instrumentVersion)!
    const input = {
      ...identity, actorUserId: 'synthetic-admin', deploymentPolicy: {
        schemaVersion: 2 as const, revision: 1, locale: 'zh-CN', territory: 'CN',
        deploymentModes: ['STANDALONE' as const], runtimePolicyHash: policy.runtimePolicyHash,
        localizationVersion: '1.0.0', inFlightCompletion: 'FROZEN_DEADLINE' as const,
      },
    }
    const plan = await planScaleInstrumentInstall(db, input)
    expect(plan.createScale).toBe(true)
    expect(plan.allowActivation).toBe(false)
    expect(plan.blockers).toEqual(['EXECUTABLE_NOT_PUBLISHED'])
    expect(plan.instruction.binding).toMatchObject({ origin: 'INSTRUMENT_SOURCE', text: selected().instruction!.text, version: '1.0.0' })
    await expect(installScaleInstrument(db, input)).rejects.toThrow('Scale install blocked: EXECUTABLE_NOT_PUBLISHED')
    expect(create).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })
})
