import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'cogest',
  educationalPurpose: '读懂题目的每个条件，逐步推出答案。',
  plainAbilityHint: '用逻辑条件做推理',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '认知估计范式（ICAR Verbal Reasoning 同族结构）；主要构念为言语关系推理（晶体-流体混合）；题库为内部原创中文题（cogest-zh-v1.0.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '阅读理解能力是必要的但不是充分的，核心是逻辑推导。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['Mind Benders / ICAR 同族范式结构；题目为内部原创并逐题手工验算。'],
  rightsProvenance: 'internal-generated',
}
