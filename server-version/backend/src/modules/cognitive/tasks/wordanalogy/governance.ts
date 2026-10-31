import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'wordanalogy',
  educationalPurpose: '先弄清前一对词的关系，再从选项里找出同样关系的一对。',
  plainAbilityHint: '用言语关系做推理',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '言语类比推理范式（ICAR Verbal Reasoning 同族结构）；主要构念为言语关系推理（晶体-流体混合）；题库为内部原创中文题（wordanalogy-zh-v1.0.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '言语题受语言熟练度与词汇量影响。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['ICAR verbal reasoning 同族范式结构（Condon & Revelle 2014）；题目为内部原创。'],
  rightsProvenance: 'internal-generated',
}
