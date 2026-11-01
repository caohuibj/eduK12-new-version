import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'wordanalogy',
  educationalPurpose: '先弄清前一对词的关系，再从选项里找出同样关系的一对。',
  plainAbilityHint: '用言语关系做推理',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '原创中文关系类比题库试用版；服务端按冻结题库推导正确性。历史题库wordanalogy-zh-v1.0.0保留，新审修订使用wordanalogy-zh-v1.1.0及独立练习。体验/标准/科研分别18/30/36题，未建立常模、信效度或新旧版本等值证据。',
  knownLimitations: [
    '言语题受语言熟练度与词汇量影响。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['项目自编中文关系类比题；逐题审核修订，不复制标准化测验题本。'],
  rightsProvenance: 'internal-generated',
}
