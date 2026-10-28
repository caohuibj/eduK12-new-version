import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'seriescomplete',
  educationalPurpose: '从数列中找出规律，选出下一个数或字母。',
  plainAbilityHint: '从序列规律做归纳外推',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '数列完成范式（ICAR Verbal Reasoning 同族结构）；主要构念为言语关系推理（晶体-流体混合）；题库为内部原创中文题（seriescomplete-zh-v1.0.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '策略差异（先算差值 vs 先看倍数）影响解题速度。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['ICAR number/letter series 同族范式结构；题目为内部原创并逐题手工验算。'],
  rightsProvenance: 'internal-generated',
}
