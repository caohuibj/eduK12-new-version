import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'letternumseries',
  educationalPurpose: '字母和数字混着出现，回忆时字母按顺序、数字按大小分别重排。',
  plainAbilityHint: '在重排要求下保持与操作序列信息',
  interactionFamily: 'item_ordering',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '字母-数字序列范式（WAIS Letter-Number Sequencing 结构；ICAR letter-number series 同族）；主要构念为工作记忆的重排/操作；字母序与数字序分别计分。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载难度差异（每试次字母数/数字数、序列长度），不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '排序策略（分组复述 vs 逐项更新）影响成绩。',
    '回忆阶段自定速，用时仅作描述。',
  ],
  sourceNotes: ['WAIS Letter-Number Sequencing 分测验结构；ICAR letter-number series 同族范式。'],
  rightsProvenance: 'internal-generated',
}
