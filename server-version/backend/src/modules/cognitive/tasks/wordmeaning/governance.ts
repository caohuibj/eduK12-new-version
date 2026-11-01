import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'wordmeaning',
  educationalPurpose: '阅读词语或给定语境，从四个选项中选择最匹配的释义。',
  plainAbilityHint: '理解词语的意思',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '原创中文词义四选一题库试用版；阅读目标词或给定语境后选择最匹配的释义。服务端按冻结题库推导正确性。历史题库wordmeaning-zh-v1.0.0保留，新审修订使用wordmeaning-zh-v1.1.0及独立练习。体验/标准/科研分别18/30/36题，未建立常模、信效度或新旧版本等值证据。',
  knownLimitations: [
    '词义掌握受阅读量与教育暴露影响，属构念本身的一部分。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['多选式词汇测验结构；题目为内部原创。'],
  rightsProvenance: 'internal-generated',
}
