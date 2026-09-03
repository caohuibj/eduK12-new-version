/**
 * integrated_gonogo_adexi_adult_zh_cn_v1
 * Go/No-Go + authorized ADEXI Chinese self-report; subject 18+.
 * Complementary cross-method evidence only — no convergence/divergence/abnormality/diagnosis
 * without reference norms. Reuses product registry bootstrap; no Prisma V3.2 finalize rewrite.
 */
import { validateAssessmentBundleDefinition } from '../definition'
import type { AssessmentBundleDefinitionV1 } from '../types'
import {
  INTEGRATED_EVIDENCE_ENGINE_KEY,
  INTEGRATED_EVIDENCE_ENGINE_VERSION,
} from '../engines/integrated-evidence-v1'

export const INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1: AssessmentBundleDefinitionV1 = (
  validateAssessmentBundleDefinition({
    schemaVersion: 1,
    bundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
    bundleVersion: '1.0.0',
    status: 'DRAFT',
    category: 'integrated',
    name: '成人 Go/No-Go + ADEXI 综合证据（描述性）',
    description: '18+ 成人：Go/No-Go 与已授权 ADEXI 中文自评的互补跨方法证据；无常模时不作聚合/分歧/异常/诊断声称。',
    respondentTypes: ['SELF'],
    initiationModes: ['TEACHER_ASSIGNMENT', 'ANONYMOUS_SELF'],
    population: {
      subjectPopulation: 'adult',
      subjectMinAgeYears: 18,
    },
    slots: [
      {
        slotKey: 'gonogo',
        unitType: 'COGNITIVE',
        position: 0,
        required: true,
        instrumentKey: 'gonogo',
        instrumentVersion: '1.0.0',
        respondentType: 'SELF',
        valueSelectors: ['commissionRate', 'dPrime'],
      },
      {
        slotKey: 'adexi',
        unitType: 'SCALE',
        position: 1,
        required: true,
        instrumentKey: 'adexi_v1',
        instrumentVersion: '2.0.0',
        respondentType: 'SELF',
        valueSelectors: ['working_memory', 'inhibition'],
      },
    ],
    engine: {
      key: INTEGRATED_EVIDENCE_ENGINE_KEY,
      version: INTEGRATED_EVIDENCE_ENGINE_VERSION,
    },
    contextDefinitionKey: 'integrated-adult-age-v1',
    contextDefinitionVersion: '1.0.0',
    reportDefinitionKey: 'integrated-evidence-report-v1',
    reportDefinitionVersion: '1.0.0',
    publicationRequirements: {
      scientificGate: true,
      rightsGate: true,
      languageGate: true,
      reportGate: true,
      safetyGate: false,
      nonCommercialOnly: false,
    },
    rightsRequirements: { required: true, instrumentKeys: ['adexi_v1'] },
    safetyCapability: { safetyCapable: false, productionTriggerEnabled: false },
    limitations: [
      'subject 18+ only — age reject below 18',
      'complementary cross-method evidence only',
      'no convergence/divergence/abnormality/diagnosis without reference norms',
      'Evidence.role never CONVERGENT/DIVERGENT',
      'ADEXI Chinese self-report must remain authorization-bound',
      'do not treat ADEXI low scores as crisis',
    ],
  })
)
