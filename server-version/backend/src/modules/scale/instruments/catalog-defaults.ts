// Identity-neutral catalog templates shared by instrument-owned sources.
export const standardIntendedUse = {
  intendedUses: [
    { use: 'RESEARCH' as const, evidenceStatus: 'SUPPORTED' as const },
    { use: 'INDIVIDUAL_REFLECTION' as const, evidenceStatus: 'SUPPORTED' as const },
    { use: 'PROGRESS_MONITORING' as const, evidenceStatus: 'EVIDENCE_UNKNOWN' as const, notes: '需要结合重复测量设计解释，不作群体比较。' },
  ],
  forbiddenUses: [
    'DIAGNOSIS' as const,
    'HIGH_STAKES_SELECTION' as const,
    'SCHOOL_RANKING' as const,
    'TEACHER_ACCOUNTABILITY' as const,
    'UNSUPPORTED_GROUP_COMPARISON' as const,
  ],
}

export const forbiddenUses = [
  'DIAGNOSIS' as const,
  'HIGH_STAKES_SELECTION' as const,
  'SCHOOL_RANKING' as const,
  'TEACHER_ACCOUNTABILITY' as const,
  'UNSUPPORTED_GROUP_COMPARISON' as const,
]

export const researchFirstUse = {
  intendedUses: [
    { use: 'RESEARCH' as const, evidenceStatus: 'SUPPORTED' as const },
    { use: 'INDIVIDUAL_REFLECTION' as const, evidenceStatus: 'EVIDENCE_UNKNOWN' as const, notes: '需在 exact-form package 与 respondent-facing feedback 规则闭环后再开放。' },
    { use: 'PROGRESS_MONITORING' as const, evidenceStatus: 'EVIDENCE_UNKNOWN' as const, notes: '重复测量解释必须结合目标人群证据与纵向安全规则。' },
  ],
  forbiddenUses,
}

export const dass21IntendedUse = {
  intendedUses: [
    { use: 'RESEARCH' as const, evidenceStatus: 'SUPPORTED' as const },
    {
      use: 'INDIVIDUAL_REFLECTION' as const,
      evidenceStatus: 'SUPPORTED' as const,
      notes: '仅提供不依赖个体分数的描述性/教育性反馈；学生或普通被试不得看到数值分数、严重程度等级或心理健康状态判断。',
    },
    {
      use: 'PROGRESS_MONITORING' as const,
      evidenceStatus: 'EVIDENCE_UNKNOWN' as const,
      notes: '内部 authoritative score 可供具备相应权限的研究/专业人员使用；学生侧不展示数值变化或自动个体解释。',
    },
  ],
  forbiddenUses,
}
