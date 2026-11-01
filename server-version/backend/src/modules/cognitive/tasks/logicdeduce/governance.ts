import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'logicdeduce',
  educationalPurpose: '读懂题目的每个条件，逐步推出答案。',
  plainAbilityHint: '用逻辑条件做推理',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '项目自编中文四选一条件推断题，描述排序、必要条件、集合关系和有限约束推断的本次表现。V2题池为36题，另有独立练习；体验/标准/科研配置分别18/30/36题。未建立与其他测验的等值关系、常模或信效度证据。',
  knownLimitations: [
    '阅读理解能力是必要的但不是充分的，核心是逻辑推导。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['固定441项目自编候选逐题审计；V2新增12道原创正式题及1道独立练习。未从外部标准化题库复制素材。'],
  rightsProvenance: 'internal-generated',
}
