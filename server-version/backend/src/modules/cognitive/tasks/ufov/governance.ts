import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'ufov',
  educationalPurpose: '眼睛盯住中心图形的同时，用余光找到周边闪过的亮点。',
  plainAbilityHint: '中心与周边同时注意的能力',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '有用视野范式（UFOV；BrainHQ Double Decision 简化版；Ball et al. 1988 结构）；主要构念为分配注意下的中心与周边同时加工；本版本使用固定偏心率与固定刺激时长，未做自适应收缩。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载刺激时长与试次数差异，不得改 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '屏幕尺寸影响周边位置的视角偏心率。',
    '本版本未做自适应难度收缩，不能推断 UFOV 大小。',
  ],
  sourceNotes: ['Ball, Wadley & Roenker (1988) UFOV 范式；BrainHQ Double Decision 同族训练形式。'],
  rightsProvenance: 'internal-generated',
}
