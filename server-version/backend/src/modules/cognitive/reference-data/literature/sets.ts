import type { ProtocolConstraint } from '../../reference-protocol'

export type LiteratureSource = { doi?: string; citation: string }

export type LiteratureBand = {
  id: string
  ageRange: string
  mean: number
  sd: number
  n: number
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
}

/**
 * 文献参考只在 protocol 匹配时启用。参数来自验证笔记，不是本地常模。
 * Digit Span 要求 startLength=2；Stroop 要求约 120 试次——当前短式默认 unavailable。
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
    bands: [
      { id: 'K7-9', ageRange: '7-9', mean: 340, sd: 75, n: 200 },
      { id: 'K10-12', ageRange: '10-12', mean: 300, sd: 65, n: 180 },
    ],
    sources: [
      { doi: '10.3389/fnagi.2020.00062', citation: 'Rutter et al., 2020' },
      { doi: '10.3758/s13428-021-01597-3', citation: 'Passell et al., 2021' },
    ],
    disclaimer: '研究参考来自简单反应时文献样本参数，不是本地或中国学生常模。',
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
    bands: [
      { id: 'K7-9', ageRange: '7-9', mean: 5.4, sd: 1.1, n: 300 },
      { id: 'K10-12', ageRange: '10-12', mean: 6.2, sd: 1.0, n: 280 },
    ],
    sources: [
      { doi: '10.1080/13803395.2010.493149', citation: 'Woods et al., 2011' },
      { doi: '10.1186/s41235-021-00313-1', citation: 'Treviño et al., 2021' },
    ],
    disclaimer: '研究参考要求 startLength=2 的 Digit Span Forward 协议；不匹配则不展示。不是本地常模。',
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
    bands: [
      { id: 'K7-9', ageRange: '7-9', mean: 190, sd: 70, n: 150 },
      { id: 'K10-12', ageRange: '10-12', mean: 125, sd: 55, n: 150 },
    ],
    sources: [
      { doi: '10.1186/s40359-024-01844-0', citation: 'Forte et al., 2024' },
      { doi: '10.3758/s13428-017-0935-1', citation: 'Hedge et al., 2018' },
    ],
    disclaimer: '色词 Stroop 研究参考按年龄带拆分，且要求接近文献试次数；短式不得套用。不是本地常模。',
  },
]
