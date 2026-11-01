import type { ScaleDefinitionV2 } from '../scale-definition'
import type { ScaleInstrumentSourceV1, ScaleGoldenCase } from '../onboarding/types'
import { researchFirstUse } from '../instruments/catalog-defaults'
import { DISCLOSURE_PRESETS } from '../policy/disclosure'

export const CHEXI_IDENTITY = { instrumentKey: 'chexi_zh_hans', instrumentVersion: '1.0.0' } as const
export const CHEXI_OFFICIAL_FORM = 'https://chexi.se/onewebmedia/Child%20Executive%20Functioning%20Inventory_SimplifiedChinese.pdf'
export const CHEXI_SCORING_SOURCE = 'https://chexi.se/onewebmedia/CHEXI%20subscales.pdf'

// Official 24-item form. The two factors combine the four original facets.
// These are direct item means, never an average of unequally sized facet means.
export const CHEXI_ITEM_GROUPS = {
  working_memory: [1, 3, 6, 7, 9, 12, 14, 17, 19, 20, 21, 23, 24],
  inhibition: [2, 4, 5, 8, 10, 11, 13, 15, 16, 18, 22],
  working_memory_facet: [1, 3, 6, 7, 9, 19, 21, 23, 24],
  planning: [12, 14, 17, 20],
  regulation: [2, 4, 8, 11, 15],
  inhibition_facet: [5, 10, 13, 16, 18, 22],
} as const
const labels: Record<keyof typeof CHEXI_ITEM_GROUPS, string> = {
  working_memory: '工作记忆相关困难（观察，含计划）',
  inhibition: '抑制相关困难（观察，含调节）',
  working_memory_facet: '工作记忆原始分面', planning: '计划原始分面',
  regulation: '调节原始分面', inhibition_facet: '抑制原始分面',
}
const keys = Object.keys(CHEXI_ITEM_GROUPS) as Array<keyof typeof CHEXI_ITEM_GROUPS>
const code = (n: number) => `CHEXI-${String(n).padStart(2, '0')}`
const answers = (value: number) => Array.from({ length: 24 }, (_, i) => ({ itemCode: code(i + 1), responseValue: value }))

/**
 * Assemble one shared source from the official private import's verbatim text.
 * No item text is bundled into public Git: public redistribution scope is unknown.
 * This factory uses existing ScaleDefinitionV2 and the generic mean scorer only.
 * It is intentionally not registered or installed by importing this module.
 */
export function createChexiZhHansSource(material: { items: readonly string[]; instruction: string }): ScaleInstrumentSourceV1 {
  if (material.items.length !== 24 || material.items.some(s => !s.trim()) || !material.instruction.trim()) {
    throw new Error('CHEXI_OFFICIAL_24_ITEM_MATERIAL_REQUIRED')
  }
  const definition: ScaleDefinitionV2 = {
    schemaVersion: 2,
    respondentType: 'observer_report',
    source: {
      title: 'Child Executive Functioning Inventory — Simplified Chinese parent/teacher report',
      citation: 'Thorell & Nyberg (2008), doi:10.1080/87565640802101516. Official simplified Chinese translation: Angela Siu, The Chinese University of Hong Kong.',
      url: CHEXI_OFFICIAL_FORM,
      publicationYear: 2008,
    },
    license: {
      status: 'unknown', redistribution: 'unknown',
      note: 'Official website permits use of available language versions without author permission. Public Git redistribution, commercial deployment and electronic administration scope are not separately specified; no durable project grant is asserted.',
    },
    display: { randomizeItems: false },
    responseSets: [{ key: 'chexi_truth_1_5', options: ['完全不正确', '不正确', '部分正确', '正确', '完全正确'].map((label, i) => ({ value: i + 1, score: i + 1, label })) }],
    items: material.items.map((content, i) => ({ itemCode: code(i + 1), content, type: 'single', required: true, sortOrder: i, responseSetKey: 'chexi_truth_1_5', randomizeOptions: false })),
    scoring: {
      scoringVersion: '1.0.0',
      itemRules: material.items.map((_, i) => ({ itemCode: code(i + 1), transform: { type: 'identity' } })),
      // Conservative project policy: official missing-item imputation is not supplied.
      defaultMissingPolicy: { type: 'complete_required' },
      scores: keys.map(key => ({ key, type: 'dimension', label: labels[key], direction: 'higher_is_worse', canonical: key === 'working_memory' || key === 'inhibition', displayPrecision: 2,
        missingPolicy: { type: 'complete_required' }, source: { type: 'items', items: CHEXI_ITEM_GROUPS[key].map(n => ({ itemCode: code(n), weight: 1 })), aggregation: 'mean' } })),
    },
    report: {
      reportVersion: '1.0.0', primaryScoreKeys: ['working_memory', 'inhibition'], scoreOrder: keys,
      interpretations: keys.map(key => ({ scoreKey: key, headline: labels[key], source: { type: 'score_only' },
        summary: '在1至5的原量尺上描述这位观察者所见的日常困难，较高表示认同的困难更多。请结合具体情境阅读。', bands: [],
        guidance: [{ category: 'reflection', text: '记录一个容易出现这种情况的活动，以及当时的任务要求、干扰和已有支持。' },
          { category: 'strategy', text: key === 'working_memory' || key === 'working_memory_facet' || key === 'planning' ? '可尝试一次给出较短的步骤，配合图片或清单，并让孩子复述要做什么。' : '转换活动前先约定提示，留出缓冲；给需要等待或暂停的时刻一个清晰信号。' }] })),
      limitations: [
        '这是成人对儿童的观察表，不是儿童自评，也不是认知任务表现。',
        '家长和教师共享题本与计分，但报告必须保留真实报告者及家庭或课堂情境；不能平均两位观察者的分数。',
        '官方尚未提供可用于本项目年龄分层的常模或缺陷界值；不作同龄排名、诊断或能力等级。',
        '两个因子与四个原始分面重叠，不构成六项独立能力，不再合成一个总分。',
        '分面缺题不插补，相关均分为空；这是项目的保守缺失策略，不是原作者给出的插补规则。',
      ],
      disclaimer: '结果用于研究与具体行为观察，不能据此判断儿童是否患有疾病或安排高风险选拔。',
    },
    referencePolicy: { type: 'none' },
  }
  const fixtures: ScaleGoldenCase[] = [1, 5].map(value => ({ name: `all-${value}`, answers: answers(value), expected: { quality: 'interpretable', scores: Object.fromEntries(keys.map(key => [key, value])), totalScoreKeys: keys } }))
  fixtures.push({ name: 'missing-item-24', answers: answers(1).filter(a => a.itemCode !== code(24)), expected: { quality: 'invalid', scores: { working_memory: null, inhibition: 1, working_memory_facet: null, planning: 1, regulation: 1, inhibition_facet: 1 }, totalScoreKeys: keys } })
  return {
    schemaVersion: 1, identity: CHEXI_IDENTITY,
    catalog: {
      schemaVersion: 1, catalogManifestVersion: 1, catalogStatus: 'CANDIDATE', scientificMaturity: 'PILOT',
      identity: { canonicalName: '儿童执行功能量表 简体中文家长及教师共用题本', abbreviation: 'SC-CHEXI', instrumentFamily: 'Childhood Executive Functioning Inventory' },
      construct: { primaryDomain: 'EXECUTIVE_FUNCTION', secondaryDomains: ['PARENT_OBSERVATION', 'TEACHER_OBSERVATION'], constructDefinition: '熟悉儿童的成人对日常工作记忆、计划、调节与抑制相关困难的观察。', constructLevel: 'SPECIFIC_CONSTRUCT',
        constructOverlapTags: ['chexi', 'observer_report', 'source:public_official', 'translation:official_angela_siu', 'rights:official_free_use', 'rights:public_redistribution_unknown', 'rights:commercial_scope_unknown', 'reference:no_age_norms'] },
      population: { minAge: 4, maxAge: 12, respondentTypes: ['PARENT', 'TEACHER'], developmentalEvidence: 'PARTIAL', populationNotes: '官方4至12岁观察表适用范围，不自动扩展到认知任务，也不表明当前数字版本已完成本地验证。' },
      administration: { itemCount: 24, estimatedMinutes: 10, administrationModes: ['PAPER', 'DIGITAL_SUPERVISED'], timeFrame: '官方题本未指定固定回忆期；不要自行添加近两周等条件。', requiredTraining: false, itemOrderLocked: true, responseFormatLocked: true,
        layoutConstraints: ['10分钟是项目负担估计，尚非实测。', '保留官方简体中文原文，包括原文中的混用字形；不作为项目新译本。'] },
      intendedUse: researchFirstUse, evidence: [], referenceApplicability: [],
    },
    localization: { schemaVersion: 1, localizationVersion: '1.0.0', sourceLocale: 'zh-CN', targetLocale: 'zh-CN', translationSource: `${CHEXI_OFFICIAL_FORM}; PDF credits Angela Siu, The Chinese University of Hong Kong`, adaptationMethod: 'ORIGINAL_SOURCE', expertReviewStatus: 'PENDING', cognitiveDebriefStatus: 'NOT_ESTABLISHED', localEvidenceRefs: [], reviewStatus: 'PENDING', notes: '官方译本按原文导入；未声称项目已完成专家签署、本地验证或新翻译。' },
    applicability: { schemaVersion: 1, policyVersion: '1.0.0', respondentTypes: ['PARENT', 'TEACHER'], subject: { ageMonths: { minInclusive: 48, maxExclusive: 156 } }, requiredContextKeys: [] },
    disclosure: { schemaVersion: 1, policyVersion: '1.0.0', audiences: {
      respondent: DISCLOSURE_PRESETS.FULL_REPORT(), subject: DISCLOSURE_PRESETS.FULL_REPORT(),
      teacher: DISCLOSURE_PRESETS.FULL_REPORT(), researcher: DISCLOSURE_PRESETS.FULL_REPORT(),
    }, unknownAudience: 'DENY' },
    instruction: { schemaVersion: 1, text: material.instruction, language: 'zh-CN', version: '1.0.0', source: CHEXI_OFFICIAL_FORM },
    executable: { releaseStatus: 'DRAFT', contentLocale: 'zh-CN', definition, references: [], goldenCases: fixtures },
  }
}
