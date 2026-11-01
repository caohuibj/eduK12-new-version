import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'wordproblem',
  educationalPurpose: '读懂一道应用题的条件和问题，选出正确答案。',
  plainAbilityHint: '把生活情境转成数学计算',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '项目自编中文四选一应用题，描述把文字条件转成算式并求解的本次表现。V2题池为36题，另有独立练习；体验/标准/科研配置分别18/30/36题。尚未进行标准化、题目难度校准或信效度验证，不能据此解释为智力、学业或年龄常模等级。',
  knownLimitations: [
    '阅读理解能力与计算熟练度都会影响成绩；题干故意保持简短以限制阅读负荷。',
    '题库有限，重复施测存在练习效应。',
  ],
  sourceNotes: ['固定441项目自编候选逐题审计；V2新增12道原创正式题及1道独立练习。未从外部标准化题库复制素材。'],
  rightsProvenance: 'internal-generated',
}
