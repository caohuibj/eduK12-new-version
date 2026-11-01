import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'arithverify',
  educationalPurpose: '判断屏幕上的加法算式对不对，又快又稳地按下对或错。',
  plainAbilityHint: '基础加法运算的准确与流畅程度',
  interactionFamily: 'button_choice',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '算术验证范式（加法等式真伪判断）；主要构念为计算流畅度；问题规模斜率为有符号量，须与正确率同读。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载难度差异（operandMax、totalTrials、timeoutMs），不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '策略差异（精算 vs 估算）会改变用时结构。',
    '输入方式（键盘/触控）影响用时记录。',
  ],
  sourceNotes: ['Groen & Parkman (1972) J Exp Psychol；Ashcraft (1992) 问题规模效应综述。'],
  rightsProvenance: 'internal-generated',
}
