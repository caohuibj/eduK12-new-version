import type { ProtocolConstraint } from '../../reference-protocol'

export type LiteratureSource = { doi?: string; citation: string }

export type LiteratureBand = {
  id: string
  ageRange: string
  mean: number
  sd: number
  n: number
}

export type LiteratureProvenance = {
  sourceId: string
  citation: string
  doi?: string
  table?: string
  originalAgeRange: string
  originalN: number | null
  originalProtocol: string
  originalMetric: string
  systemMetric: string
  transformation: 'none' | 'not_approved'
  comparable: boolean
  notes: string
  protocol: ProtocolConstraint
}

export type LiteratureReferenceSet = {
  version: string
  referenceSetVersion: string
  referenceDefinitionVersion: string
  testType: string
  metricKey: string
  direction: 'lower-is-better' | 'higher-is-better'
  protocol: ProtocolConstraint
  bands: LiteratureBand[]
  sources: LiteratureSource[]
  disclaimer: string
  enabled: boolean
  provenance: LiteratureProvenance
}

const PROTOCOL_FIELDS: Array<keyof ProtocolConstraint> = [
  'testType',
  'scoringVersions',
  'engineVersions',
  'profiles',
  'minTotalTrials',
  'totalTrials',
  'startLength',
  'minMaxLength',
  'congruentRatio',
  'foreperiodMinMs',
  'foreperiodMaxMs',
  'timeoutMs',
  'validRtFloorMs',
]

export const literatureSetIsEnabled = (set: LiteratureReferenceSet): boolean =>
  set.enabled === true
  && set.provenance.comparable === true
  && set.provenance.transformation !== 'not_approved'
  && Boolean(set.provenance.sourceId)
  && Boolean(set.provenance.originalMetric)
  && Boolean(set.provenance.systemMetric)
  && Boolean(set.provenance.originalAgeRange)
  && PROTOCOL_FIELDS.every((field) => {
    if (set.protocol[field] === undefined) return true
    return JSON.stringify(set.provenance.protocol[field]) === JSON.stringify(set.protocol[field])
  })

/**
 * Direct literature sets stay disabled until mean/SD/n can be traced to a table/row
 * with matching metric formula and age bands. Cited papers are provenance notes, not
 * currently usable comparison parameters.
 */
export const LITERATURE_REFERENCE_SETS: LiteratureReferenceSet[] = [
  {
    version: 'lit-reaction-rutter-2020-v1',
    referenceSetVersion: 'lit-reaction-rutter-2020-v1',
    referenceDefinitionVersion: 'lit-def-v1',
    testType: 'reaction',
    metricKey: 'medianRtMs',
    direction: 'lower-is-better',
    protocol: {
      testType: 'reaction',
      minTotalTrials: 30,
      foreperiodMinMs: 700,
      foreperiodMaxMs: 1500,
      timeoutMs: 2000,
    },
    bands: [],
    sources: [
      { doi: '10.3389/fnagi.2020.00062', citation: 'Rutter et al., 2020' },
      { doi: '10.3758/s13428-021-01597-3', citation: 'Passell et al., 2021' },
    ],
    disclaimer: '研究参考尚未完成指标与年龄切片审核，因此不展示。',
    enabled: false,
    provenance: {
      sourceId: 'rutter-2020-lifespan-srt-unmapped',
      citation: 'Rutter et al., 2020',
      doi: '10.3389/fnagi.2020.00062',
      originalAgeRange: 'lifespan web sample, not a K7-9 / K10-12 extract',
      originalN: null,
      originalProtocol: 'large online simple RT; device and trial count not equivalent to this short form',
      originalMetric: 'unmapped age-slice median RT',
      systemMetric: 'medianRtMs of valid hits',
      transformation: 'not_approved',
      comparable: false,
      notes: 'No audited 7-9 / 10-12 mean/SD extract is stored. Do not invent n/mean/SD.',
      protocol: {
        testType: 'reaction',
        minTotalTrials: 30,
        foreperiodMinMs: 700,
        foreperiodMaxMs: 1500,
        timeoutMs: 2000,
      },
    },
  },
  {
    version: 'lit-memory-woods-2011-v1',
    referenceSetVersion: 'lit-memory-woods-2011-v1',
    referenceDefinitionVersion: 'lit-def-v1',
    testType: 'memory',
    metricKey: 'maxSpan',
    direction: 'higher-is-better',
    protocol: {
      testType: 'memory',
      startLength: 2,
    },
    bands: [],
    sources: [
      { doi: '10.1080/13803395.2010.493149', citation: 'Woods et al., 2011' },
      { doi: '10.1186/s41235-021-00313-1', citation: 'Treviño et al., 2021' },
    ],
    disclaimer: 'Digit Span 文献协议与当前视觉固定两题 maxSpan 尚未等值，因此不展示研究参考。',
    enabled: false,
    provenance: {
      sourceId: 'woods-2011-adaptive-auditory-mean-span-unmapped',
      citation: 'Woods et al., 2011',
      doi: '10.1080/13803395.2010.493149',
      originalAgeRange: 'adult computerized sample, not K12 bands',
      originalN: null,
      originalProtocol: 'adaptive auditory Digit Span; mean-span scoring',
      originalMetric: 'mean span',
      systemMetric: 'maxSpan (visual, two trials per length)',
      transformation: 'not_approved',
      comparable: false,
      notes: 'startLength=2 is not sufficient protocol match. No K12 maxSpan parameters are stored.',
      protocol: {
        testType: 'memory',
        startLength: 2,
      },
    },
  },
  {
    version: 'lit-stroop-forte-2024-v1',
    referenceSetVersion: 'lit-stroop-forte-2024-v1',
    referenceDefinitionVersion: 'lit-def-v1',
    testType: 'stroop',
    metricKey: 'stroopEffectMs',
    direction: 'lower-is-better',
    protocol: {
      testType: 'stroop',
      minTotalTrials: 120,
      congruentRatio: 0.5,
    },
    bands: [],
    sources: [
      { doi: '10.1186/s40359-024-01844-0', citation: 'Forte et al., 2024' },
      { doi: '10.3758/s13428-017-0935-1', citation: 'Hedge et al., 2018' },
    ],
    disclaimer: '色词 Stroop 文献样本与当前短式 median 干扰效应尚未等值，因此不展示研究参考。',
    enabled: false,
    provenance: {
      sourceId: 'forte-2024-children-stroop-effect-unmapped',
      citation: 'Forte et al., 2024',
      doi: '10.1186/s40359-024-01844-0',
      table: 'children 7-11 Stroop effect',
      originalAgeRange: '7-11 (next published band 16-20, not 10-12)',
      originalN: 55,
      originalProtocol: '120 trials, fixation 400 ms, stimulus up to 3000 ms; mean RT after log transform',
      originalMetric: 'mean incongruent RT - mean congruent RT',
      systemMetric: 'median RT difference on correct trials (stroopEffectMs)',
      transformation: 'not_approved',
      comparable: false,
      notes: 'Paper reports ~9.24 ± 93.92 ms, N=55. Invented 190±70 / 125±55 n=150 bands are not permitted.',
      protocol: {
        testType: 'stroop',
        minTotalTrials: 120,
        congruentRatio: 0.5,
      },
    },
  },
]
