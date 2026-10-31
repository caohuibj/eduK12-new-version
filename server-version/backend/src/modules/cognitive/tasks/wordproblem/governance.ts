import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'wordproblem',
  educationalPurpose: '读懂一道应用题的条件和问题，选出正确答案。',
  plainAbilityHint: '把生活情境转成数学计算',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '数学应用题推理范式（Lumosity Raindrops/Chalkboard Challenge 与 Elevate 数学训练同族；韦氏算术分测验同构）；主要构念为数学问题解决（数值推理的应用化）；题库为内部原创中文题（wordproblem-zh-v1.0.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '阅读理解能力与计算熟练度都会影响成绩；题干故意保持简短以限制阅读负荷。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['选择式应用题结构；题目为内部原创并逐题手工验算。'],
  rightsProvenance: 'internal-generated',
}
