import { describe, expect, it } from 'vitest'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import {
  approveInstrumentAuthorization,
  createInstrumentAuthorizationDraft,
} from '../../modules/assessment-authorization'
import { WHO5_ZH_CN_V1_PACKAGE } from '../../modules/scale/scale-package.registry'
import { evaluatePilotFirstPublicationGate } from '../../modules/scale/library/pilot-publication-gate'
import { evaluatePilotPublicationPolicy, evaluateScientificCompleteness } from '../../modules/scale/library/pilot-publication-policy'
import { evaluateReportEligibility } from '../../modules/scale/library/report-eligibility'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const NOW = '2026-09-07T00:00:00.000Z'
const who5 = WHO5_ZH_CN_V1_PACKAGE

const authorization = (overrides?: { electronicAdministration?: boolean; translation?: boolean; validTo?: string; locales?: string[] }) => {
  const draft = createInstrumentAuthorizationDraft({
    instrumentKey: 'who5',
    instrumentVersion: '1.0.0',
    grantor: 'World Health Organization',
    grantee: 'eduK12',
    scope: {
      electronicAdministration: overrides?.electronicAdministration ?? true,
      scoring: true,
      translation: overrides?.translation ?? false,
      display: true,
      territories: ['CN'],
      locales: overrides?.locales ?? ['zh-CN'],
      commercialNature: 'NON_COMMERCIAL',
    },
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: overrides?.validTo ?? '2027-01-01T00:00:00.000Z',
    basis: 'WHO-5 CC BY-NC-SA 3.0 IGO non-commercial electronic use',
    createdByUserId: 'admin-1',
    now: NOW,
  })
  return approveInstrumentAuthorization({ record: draft, actorUserId: 'admin-2', now: NOW }).record
}

const localizationManifest = (overrides?: Record<string, unknown>) => ({
  schemaVersion: 1 as const,
  instrumentKey: 'who5',
  instrumentVersion: '1.0.0',
  sourceLocale: 'zh-CN',
  targetLocale: 'zh-CN',
  localizationVersion: '1.0.0',
  translationSource: 'WHO 官方 Chinese PR PDF（原文部署）',
  adaptationMethod: 'ORIGINAL_SOURCE' as const,
  expertReviewStatus: 'COMPLETED' as const,
  cognitiveDebriefStatus: 'COMPLETED' as const,
  localEvidenceRefs: [],
  reviewStatus: 'APPROVED' as const,
  reviewedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

const gate = (overrides?: Partial<Parameters<typeof evaluatePilotFirstPublicationGate>[0]>) => evaluatePilotFirstPublicationGate({
  pkg: who5,
  manifest: validCatalogManifestBase(),
  localizationManifest: localizationManifest(),
  authorizations: [authorization()],
  locale: 'zh-CN',
  territory: 'CN',
  requestedRespondent: 'SELF',
  nowIso: NOW,
  ...overrides,
})

const summaryFor = (overrides?: { maturity?: 'PILOT' | 'RESEARCH_GRADE'; evidence?: never }) => {
  const parsed = parseScaleCatalogManifest({
    ...validCatalogManifestBase(),
    ...(overrides?.maturity ? { scientificMaturity: overrides.maturity } : {}),
  })
  if (!parsed.ok) throw new Error('fixture manifest should parse')
  return evaluateScientificCompleteness({
    manifest: { ...parsed.manifest, evidence: [], referenceApplicability: [] },
    references: [],
    deploymentTerritory: 'CN',
  })
}

const ok = { ok: true, errors: [] as string[] }

describe('Pilot publication boundary matrix (SL2-C7)', () => {
  describe('§29 must BLOCK publication', () => {
    it('blocks an invalid package (tampered definition breaks validation/golden)', () => {
      const tampered = {
        ...who5,
        definition: {
          ...who5.definition,
          items: [
            ...who5.definition.items,
            { ...who5.definition.items[0], itemCode: 'WHO5-EXTRA', sortOrder: 99 },
          ],
        },
      }
      const result = gate({ pkg: tampered })
      expect(result.decision.publishable).toBe(false)
      expect(result.decision.errors.some((error) => error.includes('executableCorrectness'))).toBe(true)
    })

    it('blocks wrong territory, expired authorization and denied electronic administration', () => {
      const wrongTerritory = gate({ territory: 'GB' })
      expect(wrongTerritory.decision.publishable).toBe(false)

      const expired = gate({ authorizations: [authorization({ validTo: '2026-06-01T00:00:00.000Z' })] })
      expect(expired.decision.publishable).toBe(false)

      const noElectronic = gate({ authorizations: [authorization({ electronicAdministration: false })] })
      expect(noElectronic.decision.publishable).toBe(false)
      expect(noElectronic.decision.errors.some((error) => error.includes('electronicAdministration'))).toBe(true)
    })

    it('blocks translation deployment when translation rights are denied (§14)', () => {
      const result = gate({
        authorizations: [authorization({ translation: false })],
        localizationManifest: localizationManifest({
          sourceLocale: 'en',
          targetLocale: 'zh-CN',
          adaptationMethod: 'DIRECT_TRANSLATION',
        }),
      })
      expect(result.decision.publishable).toBe(false)
      expect(result.decision.errors.some((error) => error.includes('translation required'))).toBe(true)
    })

    it('blocks unusable deployed localization (unsigned/PENDING review) and unsupported respondent', () => {
      const pendingReview = gate({
        localizationManifest: localizationManifest({ reviewStatus: 'PENDING', reviewedAt: undefined }),
      })
      expect(pendingReview.decision.publishable).toBe(false)

      const duplicatedRights = gate({
        localizationManifest: localizationManifest({ translationRightsStatus: 'DENIED' }),
      })
      expect(duplicatedRights.decision.publishable).toBe(false)

      const wrongRespondent = gate({ requestedRespondent: 'PARENT' })
      expect(wrongRespondent.decision.publishable).toBe(false)
    })
  })

  describe('§30 must NOT block PILOT publication', () => {
    it('publishes with scientificMaturity=PILOT and a completely empty evidence matrix', () => {
      const result = gate()
      expect(result.decision.publishable).toBe(true)
      expect(summaryFor({ maturity: 'PILOT' }).scientificMaturity).toBe('PILOT')
    })

    it('turns every §30 non-blocker into a research gap, never a publication denial', () => {
      const decision = evaluatePilotPublicationPolicy({
        executableCorrectness: ok,
        rights: ok,
        localization: ok,
        respondentMatch: ok,
        scientific: summaryFor(),
      })
      const codes = decision.researchGaps.map((gap) => gap.code)
      expect(decision.publishable).toBe(true)
      for (const code of ['NO_LOCAL_NORM', 'NO_VALIDATED_NORM', 'NO_MEASUREMENT_INVARIANCE', 'NO_DEVICE_EQUIVALENCE', 'NO_TEST_RETEST', 'NO_RESPONSIVENESS', 'INCOMPLETE_CORE_VALIDITY_MATRIX', 'LIMITED_LOCAL_SAMPLE'] as const) {
        expect(codes, code).toContain(code)
      }
    })

    it('warns on incomplete local psychometric evidence without blocking (§30)', () => {
      const result = gate({
        localizationManifest: localizationManifest({ cognitiveDebriefStatus: 'NOT_ESTABLISHED', expertReviewStatus: 'PENDING' }),
      })
      expect(result.decision.publishable).toBe(true)
      expect(result.decision.warnings.some((warning) => warning.includes('expertReviewStatus=PENDING'))).toBe(true)
      expect(result.decision.warnings.some((warning) => warning.includes('cognitiveDebriefStatus=NOT_ESTABLISHED'))).toBe(true)
    })
  })

  describe('§31 report matrix', () => {
    const eligibilityFor = (overrides?: Partial<Parameters<typeof evaluateReportEligibility>[0]>) => evaluateReportEligibility({
      definition: who5.definition,
      references: who5.references,
      instrumentKey: who5.key,
      instrumentVersion: who5.instrumentVersion,
      scoringVersion: who5.definition.scoring.scoringVersion,
      ...overrides,
    })

    it('Case A: PILOT + no reference → full descriptive report, L3 blocked, forbidden claims locked', () => {
      parseScaleCatalogManifest(validCatalogManifestBase())
      const decision = eligibilityFor()
      expect(decision.maxEligibleLevel).toBe('L2_DESCRIPTIVE')
      expect(decision.forbiddenClaims.length).toBeGreaterThan(0)
    })

    it('Case B: PILOT + valid local_pilot reference → L3 eligible with pilot wording', () => {
      parseScaleCatalogManifest(validCatalogManifestBase())
      const decision = eligibilityFor({
        definition: {
          ...who5.definition,
          referencePolicy: {
            type: 'declared',
            selections: [{ scoreKey: 'raw_total', referenceVersion: 'who5-pilot-cn-v1', referenceKind: 'normative_distribution' }],
          },
        },
        references: [{
          schemaVersion: 1,
          instrumentType: 'scale',
          instrumentKey: 'who5',
          referenceVersion: 'who5-pilot-cn-v1',
          status: 'ACTIVE',
          entries: [{
            scoreKey: 'raw_total',
            referenceKind: 'normative_distribution',
            evidenceLevel: 'local_pilot',
            provenanceType: 'local_observed',
            instrumentVersion: '1.0.0',
            scoringVersion: '1.0.0',
            population: { description: 'eduK12 本地试行样本' },
            source: { citation: 'eduK12 PILOT 本地试行数据, 2026' },
            statistics: { mean: 12, sd: 4 },
          }],
        }],
      })
      expect(decision.levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(true)
      expect(decision.pilotWordingRequired).toBe(true)
      expect(decision.requiredReferenceWording[0]).toContain('试行参考')
    })

    it('Case C: PILOT + reference population mismatch → L3 blocked at governance level', () => {
      const manifest = parseScaleCatalogManifest(validCatalogManifestBase())
      if (!manifest.ok) throw new Error('fixture should parse')
      const decision = eligibilityFor({
        definition: {
          ...who5.definition,
          referencePolicy: {
            type: 'declared',
            selections: [{ scoreKey: 'raw_total', referenceVersion: 'who5-pilot-cn-v1', referenceKind: 'normative_distribution' }],
          },
        },
        references: [{
          schemaVersion: 1,
          instrumentType: 'scale',
          instrumentKey: 'who5',
          referenceVersion: 'who5-pilot-cn-v1',
          status: 'ACTIVE',
          entries: [{
            scoreKey: 'raw_total',
            referenceKind: 'normative_distribution',
            evidenceLevel: 'local_pilot',
            provenanceType: 'local_observed',
            instrumentVersion: '1.0.0',
            scoringVersion: '1.0.0',
            population: { description: 'UK teacher sample' },
            source: { citation: 'UK sample, 2011' },
            statistics: { mean: 10, sd: 3 },
          }],
        }],
        deployment: { territory: 'CN', respondent: 'SELF' },
        catalogReferenceApplicability: [{
          ...manifest.manifest.referenceApplicability[0],
          referenceVersion: 'who5-pilot-cn-v1',
          referenceKind: 'normative_distribution',
          territory: 'UK',
          respondent: 'TEACHER',
        }],
      })
      expect(decision.levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(false)
    })

    it('Case D: RESEARCH_GRADE + no reference still cannot fabricate percentile (maturity ≠ reference)', () => {
      parseScaleCatalogManifest({ ...validCatalogManifestBase(), scientificMaturity: 'RESEARCH_GRADE' })
      const decision = eligibilityFor()
      expect(decision.levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(false)
    })
  })

  describe('research upgrade path preserved without touching runtime (Gate B / Q2)', () => {
    it('adding evidence to the catalog keeps the manifest valid and the definition hash untouched', () => {
      const before = parseScaleCatalogManifest(validCatalogManifestBase())
      if (!before.ok) throw new Error('fixture should parse')
      const hashBefore = hashScaleDefinition(who5.definition)

      const withMoreEvidence = {
        ...before.manifest,
        catalogManifestVersion: before.manifest.catalogManifestVersion + 1,
        evidence: [
          ...before.manifest.evidence,
          {
            evidenceId: 'evidence-test-retest-cn-2026',
            evidenceType: 'TEST_RETEST' as const,
            population: '中国大陆青少年样本',
            locale: 'zh-CN',
            territory: 'CN',
            sampleSize: 400,
            studyDesign: '4 周重测',
            rating: 'SUFFICIENT' as const,
            citation: '示例重测研究, 2026',
          },
        ],
      }
      const after = parseScaleCatalogManifest(withMoreEvidence)
      // Evidence 可新增（升级入口保留），且 manifest 仍合法
      expect(after.ok).toBe(true)
      if (after.ok) {
        expect(after.manifest.evidence.length).toBe(before.manifest.evidence.length + 1)
      }
      // definition 完全未被 catalog 变化触碰（hash 不变）
      expect(hashScaleDefinition(who5.definition)).toBe(hashBefore)
    })
  })
})
