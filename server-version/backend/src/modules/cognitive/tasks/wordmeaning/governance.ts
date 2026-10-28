import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'wordmeaning',
  educationalPurpose: '先弄清前一对词的关系，再从选项里找出同样关系的一对。',
  plainAbilityHint: '用言语关系做推理',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '词汇理解范式（韦氏词汇分测验同构：词-释义选择式）；主要构念为晶体言语能力；题库为内部原创中文题（wordmeaning-zh-v1.0.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '词义掌握受阅读量与教育暴露影响，属构念本身的一部分。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['多选式词汇测验结构；题目为内部原创。'],
  rightsProvenance: 'internal-generated',
}
