import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'sharegame',
  educationalPurpose: '每轮你有一笔点数，决定分多少给一位看不到名字的同伴。',
  plainAbilityHint: '资源分配中的分享偏好',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '独裁者式分享决策范式（Dictator Game 结构，Forsythe et al. 1994；pymetrics Money Exchange 同族）；主要构念为分配偏好；全部指标为描述性偏好量，不设能力分数、不做品德推断。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载禀赋序列与轮次差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '点数/虚拟资源与真实资源下的分享偏好可能不同。',
    '没有真实接收者时，选择更接近一般分配态度而非社会互动决策。',
  ],
  sourceNotes: ['Forsythe, Horowitz, Savin & Sefton (1994) Games and Economic Behavior。'],
  rightsProvenance: 'internal-generated',
}
