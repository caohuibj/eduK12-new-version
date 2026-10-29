import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'proofread',
  educationalPurpose: '读句子找出错误的字词。',
  plainAbilityHint: '对文字细节做校对检查',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '文本校对范式（Elevate Error Finding 同族；校对/勘误测验传统）；主要构念为文字细节注意与语言规范掌握；题库为内部原创中文题（proofread-zh-v1.0.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '文字规范掌握与注意细节的能力共同影响成绩。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['校对测验结构；题目为内部原创。'],
  rightsProvenance: 'internal-generated',
}
