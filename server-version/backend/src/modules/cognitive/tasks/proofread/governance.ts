import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'proofread',
  educationalPurpose: '读句子找出错误的字词。',
  plainAbilityHint: '对文字细节做校对检查',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '原创中文错别字与“的／地”校对任务；主要构念为文字细节注意与语言规范掌握；审订版本题库为项目原创中文题（proofread-zh-v1.1.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '文字规范掌握与注意细节的能力共同影响成绩。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['校对测验结构；题目为内部原创。'],
  rightsProvenance: 'internal-generated',
}
