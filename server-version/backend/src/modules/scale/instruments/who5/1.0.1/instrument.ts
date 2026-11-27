import type { AssessmentReferenceSetDefinition } from '../../../../assessment-reference/reference'
import type { ScaleReportDefinition } from '../../../scale-definition'
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { SCALE_INSTRUMENT_SOURCE as original } from '../1.0.0/instrument'

const referenceVersion = 'who5-who2024-raw13-v1'
const reference: AssessmentReferenceSetDefinition = {
  schemaVersion: 1,
  instrumentType: 'scale',
  instrumentKey: 'who5',
  referenceVersion,
  status: 'ACTIVE',
  entries: [{
    scoreKey: 'raw_total',
    referenceKind: 'criterion_threshold',
    evidenceLevel: 'literature_beta',
    provenanceType: 'literature_reported',
    instrumentVersion: '1.0.1',
    scoringVersion: '1.0.0',
    population: { description: 'WHO 2024 手册建议的原始分参考界值；未用中国中小学生常模校准。' },
    source: { citation: "World Health Organization. The World Health Organization-Five Well-Being Index (WHO-5). Geneva, 2024. WHO/UCN/MSD/MHE/2024.1.", url: "https://cdn.who.int/media/docs/default-source/mental-health/who-5_english-original4da539d6ed4b49389e3afe47cda2326a.pdf", publicationYear: 2024 },
    statistics: { thresholds: [
      { key: 'who5_under_13', label: '低于手册建议的参考界值', minInclusive: 0, maxInclusive: 12 },
      { key: 'who5_from_13', label: '达到或高于手册建议的参考界值', minInclusive: 13, maxInclusive: 25 },
    ] },
    limitations: ['低于 13 分是 WHO 2024 手册建议进一步了解近况的参考界值，不能据此诊断疾病。'],
  }],
}

const report: ScaleReportDefinition = {
  reportVersion: '1.1.0',
  illustrationKey: 'who5-fortnight-v1',
  audienceContract: {
    schemaVersion: 1, respondent: 'STUDENT_SELF', audience: 'student', locale: 'zh-CN',
    qcReview: {
      reviewer: 'Codex 内容编辑初审', reviewedAt: '2026-11-27T00:00:00Z',
      basis: '核对 WHO 2024 英文手册计分页及所附 Chinese PR 题本。只对五题总分使用手册建议的参考界值；不生成中国中小学生常模。两段反馈和插画均为平台原创。'
    },
  },
  primaryScoreKeys: ['raw_total'],
  scoreOrder: ['raw_total', 'percentage'],
  interpretations: [
    {
      scoreKey: 'raw_total', headline: "这两周，你过得怎么样？", source: {type: 'reference', referenceVersion, referenceKind: 'criterion_threshold'},
      summary: "有时，一件小事比一句“我挺好的”更能说清近况。比如，原本很爱画画，最近翻开本子却提不起笔；又或者，课间走到窗边，忽然有兴致把落在树梢的小鸟画下来。回想过去两周，哪个瞬间最像你的日常？",
      bands: [
        {key: 'who5_under_13', label: "找个人，讲一件最近的事", summary: "按你这次的回答，过去两周，觉得轻松、有劲或有兴致的时刻，合起来比较少。不知道怎样开口时，可以找个信任的人，讲一件最近发生的小事，比如“最近做喜欢的事也有点提不起劲”。如果这样的感受持续，或已经影响睡觉、上课和日常生活，可以请对方陪你找学校心理老师或专业人员聊聊。", guidance: []},
        {key: 'who5_from_13', label: "记住一件让你觉得还不错的小事", summary: "回想这两周，有没有哪个片刻，让你觉得“我还挺喜欢这样”？可能是放学路上聊得投缘，也可能是终于腾出十分钟画画。把那一刻记下来，顺手写一句“下次什么时候还可以再来一次”。这两周如果也有难熬的事，同样值得告诉一个愿意听你说话的人。", guidance: []},
      ],
      guidance: [],
    },
    {
      scoreKey: 'percentage', headline: '同一个结果，也可以写成百分制', source: {type: 'score_only'},
      summary: "若想用百分制看结果，把五题总分乘以四即可。比如，原始分 15 分换算后是 60 分，两种写法说的是同一次回答。", bands: [], guidance: [],
    },
  ],
  limitations: ["这五题记录的是过去两周的整体感受。相同的总分，可以来自很不一样的生活经历。", '量表原作 © WHO 2024，CC BY-NC-SA 3.0 IGO。中文版为 WHO 收录的 Chinese PR 译本。平台撰写了学生解读并制作插画。'],
  disclaimer: "WHO-5 可作为了解近况的起点。分数本身不能诊断疾病；无论本次得分多少，持续的困扰都值得认真对待。",
}

export const SCALE_INSTRUMENT_SOURCE: ScaleInstrumentSourceV1 = {
  ...original,
  identity: { ...original.identity, instrumentVersion: '1.0.1' },
  instruction: {
    schemaVersion: 1, version: '1.0.0', language: 'zh-CN',
    text: '请回想过去两个星期，在每题的六种频率中选出最符合自己感受的一项。',
    source: '根据 WHO 2024 出版物所附 Chinese PR 题本的作答说明整理。',
  },
  catalog: {
    ...original.catalog,
    construct: {
      ...original.catalog.construct,
      constructOverlapTags: [...original.catalog.construct.constructOverlapTags, "主观幸福感", "身心健康", "近两周", "学生自评", "简体中文", "非商业使用"],
    },
  },
  executable: {
    ...original.executable,
    definition: {
      ...original.executable.definition,
      scoring: {
        ...original.executable.definition.scoring,
        scores: original.executable.definition.scoring.scores.map(score => ({
          ...score, label: score.key === 'raw_total' ? '五题总分（满分 25）' : '百分制换算分（满分 100）',
        })),
      },
      report,
      referencePolicy: { type: 'declared', selections: [{ scoreKey: 'raw_total', referenceVersion, referenceKind: 'criterion_threshold' }] },
    },
    references: [reference],
  },
}
