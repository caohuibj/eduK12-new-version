/**
 * SDQ / TEXI observer Bundle definitions.
 * Scale content landed from authorized PDFs; remaining gates:
 * - SDQ: electronic admin/scoring authorization (Commit 9.1)
 * - SDQ teacher: zh-CN translation pending (English T4-10 locked)
 * - TEXI: signed zh-CN localization manifest
 */
import { validateAssessmentBundleDefinition } from '../definition'
import type { AssessmentBundleDefinitionV1 } from '../types'
import {
  SCALE_EVIDENCE_ENGINE_KEY,
  SCALE_EVIDENCE_ENGINE_VERSION,
} from '../engines/scale-evidence-v1'

const observerBundle = (input: {
  bundleKey: string
  name: string
  description: string
  instrumentKey: string
  respondentType: 'PARENT' | 'TEACHER'
  ageMin: number
  ageMax: number
  notes: string[]
  valueSelectors: string[]
}): AssessmentBundleDefinitionV1 => validateAssessmentBundleDefinition({
  schemaVersion: 1,
  bundleKey: input.bundleKey,
  bundleVersion: '1.0.0',
  status: 'DRAFT',
  category: 'observer',
  name: input.name,
  description: input.description,
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
      valueSelectors: input.valueSelectors,
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
    ...input.notes,
    'do not treat low scores as crisis',
    'no cross-informant synthesis in this PR',
    'descriptive reporting only; no mainland CN clinical norms claimed',
  ],
})

export const SDQ_PARENT_OBSERVER_ZH_CN_V1 = observerBundle({
  bundleKey: 'sdq_parent_observer_zh_cn_v1',
  name: 'SDQ 家长观察',
  description: 'SDQ parent observer — zh-Hans items from authorized PDF; electronic admin gated by authorization.',
  instrumentKey: 'sdq_parent_zh_cn',
  respondentType: 'PARENT',
  ageMin: 4,
  ageMax: 17,
  valueSelectors: ['total_difficulties', 'emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial'],
  notes: [
    'Source: sdq-parent-zh-hans.pdf; Goodman scoring; UK 4-band descriptive only',
    'SDQ electronic admin/scoring must bind approved authorization',
    'source: https://www.sdqinfo.org/py/sdqinfo/c0.py',
  ],
})

export const SDQ_TEACHER_OBSERVER_ZH_CN_V1 = observerBundle({
  bundleKey: 'sdq_teacher_observer_zh_cn_v1',
  name: 'SDQ 教师观察（英文源锁定 / 中文待审）',
  description: 'SDQ teacher observer — English T4-10 source locked; zh-CN translation pending signed manifest.',
  instrumentKey: 'sdq_teacher_zh_cn',
  respondentType: 'TEACHER',
  ageMin: 4,
  ageMax: 10,
  valueSelectors: ['total_difficulties', 'emotional', 'conduct', 'hyperactivity', 'peer', 'prosocial', 'impact'],
  notes: [
    'Source form code T4-10 (ages 4–10); English items locked from sdq-teacher-t4-10-en.pdf',
    'zh-CN teacher items NOT invented — pending signed translation manifest',
    'SDQ electronic admin/scoring must bind approved authorization',
  ],
})

export const TEXI_PARENT_OBSERVER_ZH_CN_V1 = observerBundle({
  bundleKey: 'texi_parent_observer_zh_cn_v1',
  name: 'TEXI 家长观察（英文源锁定 / 中文待审）',
  description: 'TEXI parent observer — English source locked; zh-CN pending signed localization manifest.',
  instrumentKey: 'texi_parent_zh_cn',
  respondentType: 'PARENT',
  ageMin: 13,
  ageMax: 19,
  valueSelectors: ['working_memory', 'inhibition', 'total_mean'],
  notes: [
    'TEXI ages 13–19; Thorell et al. 2020 WM/Inhibition mean scoring',
    'signed localization manifest required for zh-CN content',
    'descriptive only; no mainland norms claims',
    'source: https://pubmed.ncbi.nlm.nih.gov/32090688/',
  ],
})

export const TEXI_TEACHER_OBSERVER_ZH_CN_V1 = observerBundle({
  bundleKey: 'texi_teacher_observer_zh_cn_v1',
  name: 'TEXI 教师观察（英文源锁定 / 中文待审）',
  description: 'TEXI teacher observer — English source locked; zh-CN pending signed localization manifest.',
  instrumentKey: 'texi_teacher_zh_cn',
  respondentType: 'TEACHER',
  ageMin: 13,
  ageMax: 19,
  valueSelectors: ['working_memory', 'inhibition', 'total_mean'],
  notes: [
    'TEXI ages 13–19; signed localization manifest required',
    'descriptive only; no mainland norms claims',
  ],
})
