import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'readingcomp',
  educationalPurpose: '阅读短文后回答理解问题。',
  plainAbilityHint: '阅读理解与信息提取',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '原创短文阅读与信息提取任务；主要构念为阅读理解与信息提取；审订版本题库为项目原创中文短文+理解题（readingcomp-zh-v1.1.0），正确性由服务端按题库推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载题库版本与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '阅读速度与理解深度共同影响成绩。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['原创中文短文及题目；不复制标准化测验题库。'],
  rightsProvenance: 'internal-generated',
}
