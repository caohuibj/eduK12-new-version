import type { AssessmentBundleDefinitionV1, EvidenceItemV1 } from '../../modules/assessment-bundle'

export const HASH_A = 'a'.repeat(64)
export const HASH_B = 'b'.repeat(64)

export const cognitiveSelfBundle = (
  overrides: Partial<AssessmentBundleDefinitionV1> = {},
): AssessmentBundleDefinitionV1 => ({
  schemaVersion: 1,
  bundleKey: 'cognitive_response_inhibition_v1',
  bundleVersion: '1.0.0',
  status: 'DRAFT',
  category: 'cognitive',
  name: 'Response inhibition',
  description: 'Go/No-Go and SST descriptive bundle',
  respondentTypes: ['SELF'],
  initiationModes: ['TEACHER_ASSIGNMENT', 'ANONYMOUS_SELF'],
  population: { subjectPopulation: 'unspecified' },
  slots: [
    {
      slotKey: 'gonogo',
      unitType: 'COGNITIVE',
      position: 0,
      required: true,
      instrumentKey: 'gonogo',
      instrumentVersion: '1.0.0',
      respondentType: 'SELF',
      valueSelectors: ['commissionRate'],
    },
    {
      slotKey: 'sst',
      unitType: 'COGNITIVE',
      position: 1,
      required: true,
      instrumentKey: 'sst',
      instrumentVersion: '1.0.0',
      respondentType: 'SELF',
      valueSelectors: ['ssrtMs'],
    },
  ],
  engine: { key: 'cognitive-domain-v1', version: '1.0.0' },
  contextDefinitionKey: null,
  contextDefinitionVersion: null,
  reportDefinitionKey: 'cognitive-domain-report-v1',
  reportDefinitionVersion: '1.0.0',
  publicationRequirements: {
    scientificGate: true,
    rightsGate: false,
    languageGate: true,
    reportGate: true,
    safetyGate: false,
    nonCommercialOnly: false,
  },
  rightsRequirements: { required: false, instrumentKeys: [] },
  safetyCapability: { safetyCapable: false, productionTriggerEnabled: false },
  limitations: ['descriptive only'],
  ...overrides,
})

export const observerBundle = (): AssessmentBundleDefinitionV1 => ({
  ...cognitiveSelfBundle({
    bundleKey: 'sdq_parent_observer_zh_cn_v1',
    category: 'observer',
    respondentTypes: ['PARENT'],
    initiationModes: ['TEACHER_ASSIGNMENT', 'PARENT_SELF_SERVE'],
    population: { subjectPopulation: 'youth', subjectMinAgeYears: 4, subjectMaxAgeYears: 17 },
    slots: [{
      slotKey: 'sdq',
      unitType: 'SCALE',
      position: 0,
      required: true,
      instrumentKey: 'sdq',
      instrumentVersion: '1.0.0',
      respondentType: 'PARENT',
      valueSelectors: ['total', 'emotional'],
    }],
    engine: { key: 'scale-evidence-v1', version: '1.0.0' },
    reportDefinitionKey: 'scale-evidence-report-v1',
  }),
})

export const formSlotBundle = (): AssessmentBundleDefinitionV1 => (
  cognitiveSelfBundle({
    bundleKey: 'context_form_demo_v1',
    slots: [
      {
        slotKey: 'background',
        unitType: 'FORM',
        position: 0,
        required: true,
        instrumentKey: 'background_form',
        instrumentVersion: '1.0.0',
        respondentType: 'SELF',
      },
      {
        slotKey: 'gonogo',
        unitType: 'COGNITIVE',
        position: 1,
        required: true,
        instrumentKey: 'gonogo',
        instrumentVersion: '1.0.0',
        respondentType: 'SELF',
      },
    ],
  })
)

export const scaleEvidenceItem = (overrides: Partial<EvidenceItemV1> = {}): EvidenceItemV1 => ({
  evidenceKey: 'sdq.total.primary',
  constructKey: 'broad.mental_health',
  source: {
    kind: 'SCALE_SCORE',
    slotKey: 'sdq',
    scoreKey: 'total',
    sourceResultHash: HASH_A,
  },
  value: { state: 'present', value: 12, unit: 'score' },
  quality: 'interpretable',
  criterionBandKey: 'sdq.total.normal',
  role: 'PRIMARY',
  ...overrides,
})
