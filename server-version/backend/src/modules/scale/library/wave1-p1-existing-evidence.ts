import type { ScaleEvidenceRecord } from './catalog-manifest'
import type { ExpandedScaleLibraryEntry, ExpandedScaleLibraryReadModel } from './wave1-p1-read-model'

const WHO5_CHINA_EVIDENCE: ScaleEvidenceRecord = {
  evidenceId: 'who5-cn-fung-2022',
  evidenceType: 'CROSS_CULTURAL_VALIDITY',
  population: '中国大陆大学本科生（广东高校，两项横断面研究）',
  ageRange: 'Study 1 mean 20.56 years; Study 2 mean 20.41 years',
  locale: 'zh-CN',
  territory: 'CN',
  sampleSize: 1414,
  studyDesign: 'Two cross-sectional psychometric studies; internal consistency, EFA/CFA, concurrent and construct validity',
  rating: 'SUFFICIENT',
  citation: 'Fung SF, Kong CYW, Liu YM, et al. (2022). Validity and Psychometric Evaluation of the Chinese Version of the 5-Item WHO Well-Being Index. Frontiers in Public Health, 10, 872436.',
  doi: '10.3389/fpubh.2022.872436',
  url: 'https://doi.org/10.3389/fpubh.2022.872436',
  notes: 'Study 1 n=903, Study 2 n=511. 该核心大陆 validation 直接支持大学生/青年成人，不直接验证当前产品 9–18 岁 K-12 入口。',
}

const SDQ_CHINA_EVIDENCE: ScaleEvidenceRecord = {
  evidenceId: 'sdq-cn-du-2008',
  evidenceType: 'CROSS_CULTURAL_VALIDITY',
  population: '上海 12 个行政区幼儿园、小学和中学的 3–17 岁儿童青少年；家长、教师及 11–17 岁自评',
  ageRange: '3–17 years; self-report 11–17 years',
  locale: 'zh-CN',
  territory: 'CN',
  sampleSize: 1965,
  studyDesign: 'Community epidemiological psychometric study; parent/teacher/self-report reliability, factor structure, convergent/discriminant validity and local descriptive norms',
  rating: 'MIXED',
  citation: 'Du Y, Kou J, Coghill D. (2008). The validity, reliability and normative scores of the parent, teacher and self report versions of the Strengths and Difficulties Questionnaire in China. Child and Adolescent Psychiatry and Mental Health, 2, 8.',
  doi: '10.1186/1753-2000-2-8',
  url: 'https://doi.org/10.1186/1753-2000-2-8',
  notes: '家长/教师完整数据 n=1,965，自评完整三方数据 n=690。五因子结构仅部分复现；Peer Problems 与部分 Conduct/self-report 内部一致性较弱，因此不把本研究的 banding/cut-off 自动升级为平台 reference。',
}

const withEvidence = (
  entry: ExpandedScaleLibraryEntry,
  evidence: ScaleEvidenceRecord,
  coverageText: string,
  governanceNote?: string,
): ExpandedScaleLibraryEntry => {
  const next: ExpandedScaleLibraryEntry = {
    ...entry,
    evidence: {
      recordCount: Math.max(entry.evidence.recordCount, 1),
      status: 'EVIDENCE_RECORDED',
      coverageText,
    },
  }

  if (entry.governance && 'evidence' in entry.governance) {
    const existing = entry.governance.evidence as ScaleEvidenceRecord[]
    next.governance = {
      ...entry.governance,
      evidence: existing.some((record) => record.evidenceId === evidence.evidenceId)
        ? existing.map((record) => ({ ...record }))
        : [...existing.map((record) => ({ ...record })), { ...evidence }],
      gate: {
        ...entry.governance.gate,
        warnings: governanceNote
          ? [...new Set([...entry.governance.gate.warnings, governanceNote])]
          : [...entry.governance.gate.warnings],
      },
    } as typeof next.governance
  }

  return next
}

export const enrichExistingP1Evidence = (model: ExpandedScaleLibraryReadModel): ExpandedScaleLibraryReadModel => ({
  ...model,
  entries: model.entries.map((entry) => {
    if (entry.identity.instrumentKey === 'who5') {
      return withEvidence(
        entry,
        WHO5_CHINA_EVIDENCE,
        '已记录中国大陆大学生 WHO-5 validation（N=1,414）。该证据支持简体中文大学生/青年成人使用，但不直接验证当前产品 9–18 岁入口；因此仍不作 K-12 常模或本地验证声称。',
        'WHO-5 中国核心 validation 样本为大学生，不能把该证据直接外推为 9–18 岁发展效度。',
      )
    }
    if (entry.identity.instrumentKey === 'sdq_parent_zh_cn') {
      return withEvidence(
        entry,
        SDQ_CHINA_EVIDENCE,
        '已记录上海 3–17 岁社区样本的家长/教师/自评中文 SDQ validation。证据与 K-12/家长观察场域直接相关，但部分分量表的内部一致性和五因子复现较弱。',
      )
    }
    if (entry.identity.instrumentKey === 'sdq_teacher_zh_cn') {
      return withEvidence(
        entry,
        SDQ_CHINA_EVIDENCE,
        '中文 SDQ 教师版已有上海 3–17 岁社区样本 validation；但当前 executable Teacher T4–10 package 仍是英文来源，因此该中文证据属于 instrument-family/localization evidence，不视为当前英文 runtime exact-form validation。',
        '当前 Teacher executable package 为英文来源；Du et al. (2008) 中文教师版证据不可冒充当前英文 runtime localization 的 exact-form 证据。',
      )
    }
    return entry
  }),
})
