/**
 * SDQ / TEXI observer Bundle structural stubs.
 * Scale package content is BLOCKED until official sources + gates land.
 * Do not invent SDQ/TEXI item text.
 */
import { validateAssessmentBundleDefinition } from '../definition'
import type { AssessmentBundleDefinitionV1 } from '../types'
import {
  SCALE_EVIDENCE_ENGINE_KEY,
  SCALE_EVIDENCE_ENGINE_VERSION,
} from '../engines/scale-evidence-v1'

const observerStub = (input: {
  bundleKey: string
  name: string
  instrumentKey: string
  respondentType: 'PARENT' | 'TEACHER'
  ageMin: number
  ageMax: number
  notes: string[]
}): AssessmentBundleDefinitionV1 => validateAssessmentBundleDefinition({
  schemaVersion: 1,
  bundleKey: input.bundleKey,
  bundleVersion: '1.0.0',
  status: 'DRAFT',
  category: 'observer',
  name: input.name,
  description: `${input.name} — Scale package BLOCKED pending official source; do not invent items.`,
  respondentTypes: [input.respondentType],
  initiationModes: input.respondentType === 'PARENT'
    ? ['TEACHER_ASSIGNMENT', 'PARENT_SELF_SERVE']
    : ['TEACHER_ASSIGNMENT'],
  population: {
    subjectPopulation: 'youth',
    subjectMinAgeYears: input.ageMin,
    subjectMaxAgeYears: input.ageMax,
  },
  slots: [
    {
      slotKey: input.instrumentKey,
      unitType: 'SCALE',
      position: 0,
      required: true,
      instrumentKey: input.instrumentKey,
      instrumentVersion: '1.0.0',
      respondentType: input.respondentType,
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
    nonCommercialOnly: false,
  },
  rightsRequirements: { required: true, instrumentKeys: [input.instrumentKey] },
  safetyCapability: { safetyCapable: false, productionTriggerEnabled: false },
  limitations: [
    'Scale package content BLOCKED — official item source unavailable; not fabricated',
    ...input.notes,
    'do not treat low scores as crisis',
    'no cross-informant synthesis in this PR',
  ],
})

export const SDQ_PARENT_OBSERVER_ZH_CN_V1 = observerStub({
  bundleKey: 'sdq_parent_observer_zh_cn_v1',
  name: 'SDQ 家长观察（阻塞）',
  instrumentKey: 'sdq_parent_zh_cn',
  respondentType: 'PARENT',
  ageMin: 4,
  ageMax: 18,
  notes: [
    'SDQ electronic admin/scoring must bind approved authorization',
    'source: https://www.sdqinfo.org/py/sdqinfo/c0.py',
  ],
})

export const SDQ_TEACHER_OBSERVER_ZH_CN_V1 = observerStub({
  bundleKey: 'sdq_teacher_observer_zh_cn_v1',
  name: 'SDQ 教师观察（阻塞）',
  instrumentKey: 'sdq_teacher_zh_cn',
  respondentType: 'TEACHER',
  ageMin: 4,
  ageMax: 18,
  notes: [
    'SDQ electronic admin/scoring must bind approved authorization',
    'source: https://www.sdqinfo.org/py/sdqinfo/c0.py',
  ],
})

export const TEXI_PARENT_OBSERVER_ZH_CN_V1 = observerStub({
  bundleKey: 'texi_parent_observer_zh_cn_v1',
  name: 'TEXI 家长观察（阻塞）',
  instrumentKey: 'texi_parent_zh_cn',
  respondentType: 'PARENT',
  ageMin: 13,
  ageMax: 19,
  notes: [
    'TEXI ages 13–19; signed localization manifest required',
    'descriptive only; no mainland norms claims',
    'source: https://pubmed.ncbi.nlm.nih.gov/32090688/',
  ],
})

export const TEXI_TEACHER_OBSERVER_ZH_CN_V1 = observerStub({
  bundleKey: 'texi_teacher_observer_zh_cn_v1',
  name: 'TEXI 教师观察（阻塞）',
  instrumentKey: 'texi_teacher_zh_cn',
  respondentType: 'TEACHER',
  ageMin: 13,
  ageMax: 19,
  notes: [
    'TEXI ages 13–19; signed localization manifest required',
    'descriptive only; no mainland norms claims',
  ],
})
