import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'gamblingdeck',
  educationalPurpose: '四个宝箱各藏着不同的输赢规律，边开箱边学习哪个更划算。',
  plainAbilityHint: '从反馈中学习奖惩规律并调整选择',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '四箱决策学习范式（IGT 结构，儿童点数化；Bechara et al. 1994；Crone & van der Molen 2004 儿童版）；奖惩计划钉在 scoringVersion；分块斜率为有符号量。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载试次数差异，不得改动计划、scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '点数奖励与真实激励的学习信号可能不同。',
    '箱选择频率决定每箱计划内的位置，试次间不独立。',
  ],
  sourceNotes: ['Bechara, Damasio, Damasio & Anderson (1994) Cognition；Crone & van der Molen (2004) Dev Neuropsychol（儿童版结构）。'],
  rightsProvenance: 'internal-generated',
}
