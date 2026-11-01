import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'symbolmatch',
  educationalPurpose: '照着图例，尽快找出符号对应的数字。',
  plainAbilityHint: '查表配对的速度与准确',
  interactionFamily: 'button_choice',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '符号-数字配对范式（编码/SDMT 结构，Smith 1982；WAIS-IV Coding 同族）；映射表随 config 冻结；速度-准确率须同读。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载映射集与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '映射表熟悉化（学习效应）随试次增加而出现。',
    '输入方式（键盘/触控）影响用时记录。',
  ],
  sourceNotes: ['Smith (1982) Symbol Digit Modalities Test；WAIS-IV Coding 同族范式结构。'],
  rightsProvenance: 'internal-generated',
}
