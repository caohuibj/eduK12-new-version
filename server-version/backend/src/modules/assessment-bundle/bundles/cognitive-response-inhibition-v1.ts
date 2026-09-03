import { validateAssessmentBundleDefinition } from '../definition'
import type { AssessmentBundleDefinitionV1 } from '../types'
import {
  COGNITIVE_DOMAIN_ENGINE_KEY,
  COGNITIVE_DOMAIN_ENGINE_VERSION,
} from '../engines/cognitive-domain-v1'

/**
 * Product Bundle: Go/No-Go + SST cognitive-only descriptive domain profile.
 * References existing task identities only — does not change UNIT submit.
 * Item/content gates for scales are out of scope; this Bundle is cognitive-only.
 */
export const COGNITIVE_RESPONSE_INHIBITION_V1: AssessmentBundleDefinitionV1 = (
  validateAssessmentBundleDefinition({
    schemaVersion: 1,
    bundleKey: 'cognitive_response_inhibition_v1',
    bundleVersion: '1.0.0',
    status: 'DRAFT',
    category: 'cognitive',
    name: '反应抑制领域画像',
    description: 'Go/No-Go 与 Stop-Signal 描述性领域画像；不产生认知总分，无常模时不作异常判定。',
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
        valueSelectors: ['commissionRate', 'dPrime'],
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
    engine: {
      key: COGNITIVE_DOMAIN_ENGINE_KEY,
      version: COGNITIVE_DOMAIN_ENGINE_VERSION,
    },
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
    limitations: [
      'descriptive domain profile only',
      'no cognitive total score',
      'no abnormality classification without reference norms',
    ],
  })
)
