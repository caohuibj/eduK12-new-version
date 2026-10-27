import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'numberline',
  educationalPurpose: '在这条数字线上，点出你心里那个数的位置，看看估计得有多准。',
  plainAbilityHint: '把数字放到数轴上的估计能力',
  interactionFamily: 'position_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'medium',
  adminScientificNotes: '数字线估计范式（0-N 位置估计）；主要构念为数值表征的线性度；PAE 与方向偏差须同读，偏差为有符号量。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载难度差异（lineMax、totalTrials、maxResponseMs），不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '点击精度与设备屏幕尺寸影响位置记录。',
    '线上刻度提示方式会改变策略；本任务仅标注端点与中点。',
  ],
  sourceNotes: ['Siegler & Opfer (2003) Child Dev；Holloway & Ansari (2009)。'],
  rightsProvenance: 'internal-generated',
}
