import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'readingcomp',
  educationalPurpose: '阅读短文后回答理解问题。',
  plainAbilityHint: '阅读理解与信息提取',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '阅读理解范式（Elevate Reading 同族；标准化阅读理解测验结构）；主要构念为阅读理解与信息提取；题库为内部原创中文短文+理解题（readingcomp-zh-v1.0.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '阅读速度与理解深度共同影响成绩。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['标准化阅读理解测验结构；题目为内部原创。'],
  rightsProvenance: 'internal-generated',
}
