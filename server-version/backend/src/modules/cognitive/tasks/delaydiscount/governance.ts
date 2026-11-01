import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'delaydiscount',
  educationalPurpose: '在“现在拿小奖励”和“过几天拿大奖励”之间做选择，看看你如何权衡等待。',
  plainAbilityHint: '对即时与延后奖赏的权衡倾向',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '跨期选择范式（调整金额二分法，Richards et al. 1999）；主要构念为延迟折扣；AUC 按 Myerson et al. (2001) 以天数归一化延迟计算；超时带不进入 AUC。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载难度差异（delayBands、delayedAmount、bisectionSteps），不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '假设货币/点数奖励，与真实损失情境的折扣率不同。',
    '超时使所在延迟带不完整，AUC 撤下而不插补。',
  ],
  sourceNotes: ['Richards, Zhang, Mitchell & de Wit (1999) Exp Clin Psychopharmacol；Myerson, Green & Warusawitharana (2001) J Exp Anal Behav。'],
  rightsProvenance: 'internal-generated',
}
