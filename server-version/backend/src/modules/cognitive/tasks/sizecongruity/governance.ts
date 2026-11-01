import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'sizecongruity',
  educationalPurpose: '两个数字比大小：只看数值，别被字体大小带偏。',
  plainAbilityHint: '数值信息与外观信息冲突时的抗干扰表现',
  interactionFamily: 'button_choice',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '数量 Stroop / 大小一致性范式（Henik & Tzelgov 1982）；主要构念为数值干扰控制；difference 指标须与条件正确率同读。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载难度差异（digit 范围、font 比例、timeoutMs），不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '数值距离效应（小间距更难）影响用时。',
    '物理大小差异的显著度由 frozen config 决定，跨 config 不可比。',
  ],
  sourceNotes: ['Henik & Tzelgov (1982) Mem Cognit；Pinto, Pritchard & Clark (CBB Double Trouble) 同族范式。'],
  rightsProvenance: 'internal-generated',
}
