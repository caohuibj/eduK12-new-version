import type { ReportingSourceSummary } from '../../api/reporting'
const families:Record<string,string>={SCALE:'量表',COGNITIVE:'认知任务',BUNDLE:'综合测评',SITUATIONAL:'情境测评'}
export function measurementLabel(source:ReportingSourceSummary) {
  const key=source.resource.key
  const name=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(key)?source.runName:key.replace(/_/g,' ')
  return `${name} · ${families[source.resource.family] || '测量'}`
}
export function resourceLabel(sources:ReportingSourceSummary[],key:string) {
  const source=sources.find(s=>`${s.resource.family}/${s.resource.key}`===key)
  return source?measurementLabel(source):'测量项目'
}

export function comparabilityLabel(level: string) {
  return ({ EXACT:'完全可比', COMPATIBLE:'兼容可比', LINKED:'经关联证据支持', LIMITED:'可比性有限', NOT_COMPARABLE:'不可直接比较' } as Record<string,string>)[level] ?? '可比性待确认'
}
export function operationLabel(operation: string) {
  return ({ SIDE_BY_SIDE:'并列展示', DESCRIPTIVE_TREND:'描述变化趋势', NUMERIC_DELTA:'计算变化量' } as Record<string,string>)[operation] ?? '按报告方案限定的操作'
}
export function waveLabel(ordinal: number, key?: string) {
  const date = key?.split(' / ')[0]
  return `第 ${ordinal} 次测量${date && /^\d{4}-\d{2}-\d{2}T/.test(date) ? ` · ${new Date(date).toLocaleDateString()}` : ''}`
}

export function limitationLabel(value: string) {
  return ({
    COMPARABILITY_EVIDENCE_REQUIRED:'缺少支持跨时间比较的证据',
    COMPARABILITY_RULE_SCOPE_MISMATCH:'可比性规则不适用于所选测量',
    RESOURCE_IDENTITY_MISMATCH:'测量项目不同，不能直接比较',
    LIMITED_COMPARABILITY:'仅支持有限的描述性比较',
    LINKING_EVIDENCE_REQUIRED_FOR_INTERPRETATION:'解释变化时须结合关联证据',
    INDEPENDENT_WAVE_POPULATIONS:'各次测量的参与人群可能不同',
    NOT_INDIVIDUAL_CHANGE:'群体趋势不代表个人变化',
    LEGACY_UNFROZEN_INPUT:'包含未冻结的历史数据',
    MIXED_MATURITY_INPUTS:'各来源的证据成熟度不同',
    DESCRIPTIVE_ONLY:'仅用于描述测量结果',
    NOT_A_DIAGNOSIS:'不用于诊断',
    NO_CAUSAL_INFERENCE:'不能据此推断因果',
  } as Record<string,string>)[value] ?? value
}


export function evidenceLevelLabel(level: string) {
  return ({
    PILOT:'试行证据',
    RESEARCH_READY:'研究就绪',
    RESEARCH_GRADE:'研究级证据',
  } as Record<string,string>)[level] ?? level.replace(/_/g,' ')
}

export function matchedModeLabel(mode: string) {
  return ({
    PAIRWISE:'两个时间点配对',
    FULL_CASE:'全部时间点均有测量',
  } as Record<string,string>)[mode] ?? '按报告方案匹配'
}

export function countKindLabel(kind: string | undefined) {
  return ({
    PAIRED_VALID:'有效配对',
    COMPLETE_CASE:'完整测量',
  } as Record<string,string>)[kind || ''] ?? '有效结果'
}

export function aggregationLabel(key: string) {
  return ({
    mean:'均值',
    median:'中位数',
    min:'最小值',
    max:'最大值',
    sum:'总和',
    count:'数量',
    rate:'比例',
    proportion:'比例',
    standardDeviation:'标准差',
    sd:'标准差',
  } as Record<string,string>)[key] ?? key.replace(/_/g,' ')
}
