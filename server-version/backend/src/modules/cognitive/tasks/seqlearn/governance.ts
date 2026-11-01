import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'seqlearn',
  educationalPurpose: '信号出现在四个格子之一，尽快按对应按键——位置规律藏在你的反应时间里。',
  plainAbilityHint: '从重复结构中隐性学习的速度变化',
  interactionFamily: 'keypad_sequence',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '序列反应时范式（SRT，Nissen & Bullemer 1987）；主要构念为隐性序列学习；序列学习效应 = 随机块与后期序列块正确 RT 中位数之差（有符号量）；模式块位置由冻结序列权威校验，随机块位置为客户端观察事实。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载试次数与随机块位置差异，不得改动序列、scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '显性觉察（被试发现规律）会改变学习性质，本任务不测觉察。',
    '键盘与触控输入的用时分布不同。',
  ],
  sourceNotes: ['Nissen & Bullemer (1987) J Exp Psychol HPP。'],
  rightsProvenance: 'internal-generated',
}
