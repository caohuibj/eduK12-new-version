import { validateAssessmentBundleDefinition } from '../definition'
import type { AssessmentBundleDefinitionV1 } from '../types'
import {
  SCALE_EVIDENCE_ENGINE_KEY,
  SCALE_EVIDENCE_ENGINE_VERSION,
} from '../engines/scale-evidence-v1'

/**
 * WHO-5 youth self Bundle — Scale package who5@1.0.0 landed in Commit 10
 * from official WHO Chinese PR PDF (WHO-UCN-MSD-MHE-2024.01).
 * Multi scoreKey selectors (raw_total + percentage) are intentional.
 * Code status remains DRAFT until publication gates + rights pass.
 */
export const WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1: AssessmentBundleDefinitionV1 = (
  validateAssessmentBundleDefinition({
    schemaVersion: 1,
    bundleKey: 'wellbeing_who5_youth_self_zh_cn_v1',
    bundleVersion: '1.0.0',
    status: 'DRAFT',
    category: 'scale_self',
    name: 'WHO-5 青少年自评（描述性）',
    description: 'WHO-5 青少年本人自评描述性报告；官方简体中文题目已落地；非商业部署门控。',
    respondentTypes: ['SELF'],
    initiationModes: ['TEACHER_ASSIGNMENT', 'ANONYMOUS_SELF'],
    population: {
      subjectPopulation: 'youth',
      subjectMinAgeYears: 9,
      subjectMaxAgeYears: 18,
    },
    slots: [
      {
        slotKey: 'who5',
        unitType: 'SCALE',
        position: 0,
        required: true,
        instrumentKey: 'who5',
        instrumentVersion: '1.0.0',
        respondentType: 'SELF',
        valueSelectors: ['raw_total', 'percentage'],
      },
    ],
    engine: {
      key: SCALE_EVIDENCE_ENGINE_KEY,
      version: SCALE_EVIDENCE_ENGINE_VERSION,
    },
    contextDefinitionKey: null,
    contextDefinitionVersion: null,
    reportDefinitionKey: 'scale-evidence-report-v1',
    reportDefinitionVersion: '1.0.0',
    publicationRequirements: {
      scientificGate: true,
      rightsGate: true,
      languageGate: true,
      reportGate: true,
      safetyGate: false,
      nonCommercialOnly: true,
    },
    rightsRequirements: { required: true, instrumentKeys: ['who5'] },
    safetyCapability: { safetyCapable: false, productionTriggerEnabled: false },
    limitations: [
      'strictly descriptive',
      'non-commercial publication only',
      'official WHO-5 Chinese PR items from WHO-UCN-MSD-MHE-2024.01',
      'do not treat low scores as crisis',
      'not Chinese norms / not diagnosis',
    ],
  })
)
