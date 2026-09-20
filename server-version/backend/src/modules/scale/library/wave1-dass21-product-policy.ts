import type { ExpandedScaleLibraryEntry, ExpandedScaleLibraryReadModel } from './wave1-p1-read-model'

const DASS21_KEY = 'dass21_zh_cn'

const REPORT_LIMITATIONS = [
  '学生/普通被试侧不显示 DASS 数值分数、严重程度等级、百分位、常模位置或心理健康状态判断。',
  '学生侧反馈不依赖隐藏分数生成自动个体解释；仅提供与所有被试一致的描述性/教育性说明和一般支持信息。',
  '内部 authoritative Depression / Anxiety / Stress scoring 仅供具备相应权限的研究或专业视图使用，不得通过 final-submit 或普通学生报告 API 泄露。',
  '标准 DASS-21 当前产品准入边界为 14 岁及以上；14 岁以下必须走独立 DASS-Y instrument identity。',
  '当前不启用严重程度 cut-off、中国常模、百分位或诊断结论。',
]

const REPORT_DISCLAIMER = '本问卷关注过去一周的一些情绪和身体体验。学生侧仅提供非分数化、非诊断性的描述与一般支持信息；完成本问卷不能用于判断个人是否存在某种心理障碍，也不代表对个人心理健康状态的认定。'

const applyToEntry = (entry: ExpandedScaleLibraryEntry): ExpandedScaleLibraryEntry => {
  if (entry.identity.instrumentKey !== DASS21_KEY) return entry

  const next = {
    ...entry,
    evidence: {
      ...entry.evidence,
      coverageText: '已记录中国大陆大学生与成人 DASS-21 简体中文/大陆语言适配证据。当前标准 DASS-21 产品边界为 14 岁及以上；大陆证据在大学生和成人样本最充分，14–17 岁仍按 PILOT 边界解释，不声称中国青少年常模或 exact-form 本地验证。',
    },
    report: {
      ...entry.report,
      dimensionLabels: ['抑郁相关体验', '焦虑相关体验', '压力/紧张相关体验'],
      limitations: REPORT_LIMITATIONS,
      disclaimer: REPORT_DISCLAIMER,
    },
    availability: {
      ...entry.availability,
      reasons: [...new Set([
        ...entry.availability.reasons,
        'DASS-21 发布前必须实现 respondent-safe result projection：学生/普通被试 final-submit 响应不得包含计算后的 result。',
        'DASS-21 发布前必须实现可审计的 14+ 年龄准入；仅有 Library minAge metadata 不构成 runtime gate。',
        '大陆自然化 zh-CN 文本正在进行专家语义审校与认知/bridging review，尚未冻结为 executable exact form。',
      ])],
    },
  } as ExpandedScaleLibraryEntry

  if (!entry.governance) return next

  next.governance = {
    ...entry.governance,
    gate: {
      ...entry.governance.gate,
      publishable: false,
      errors: [...new Set([
        ...entry.governance.gate.errors,
        'DASS-21 缺少 respondent-safe result projection，当前 student/respondent final-submit projection 仍可能暴露 authoritative result。',
        'DASS-21 缺少可审计的 age >= 14 runtime admission gate。',
        'DASS-21 Mainland zh-CN wording revision 尚未完成 expert/cognitive/bridging review。',
      ])],
      warnings: [...new Set([
        ...entry.governance.gate.warnings,
        '内部 authoritative scoring 与学生可见反馈必须保持分离：学生侧只能获得非分数化描述性反馈。',
      ])],
    },
  } as typeof next.governance

  return next
}

export const applyDass21ProductPolicy = (model: ExpandedScaleLibraryReadModel): ExpandedScaleLibraryReadModel => ({
  ...model,
  entries: model.entries.map(applyToEntry),
})
