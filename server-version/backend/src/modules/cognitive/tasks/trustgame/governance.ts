import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'trustgame',
  educationalPurpose: '预设模拟方案提出点数分配，你决定接受还是拒绝；拒绝则双方都得零，没有实时同伴或真实交易。',
  plainAbilityHint: '对不公平分配的反应与取舍',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '最后通牒博弈响应者范式（ultimatum responder；pymetrics Money Exchange 2 同族；Forsythe et al. 1994 与 Güth et al. 1982 结构）；主要构念为公平感知与惩罚意愿；提议序列随 config 冻结，公平/不公平划分由服务端按提议推导。与 sharegame（提议者）互补。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载提议序列与轮次差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '点数/虚拟资源与真实资源的拒绝意愿可能不同。',
    '没有真实交互对象时更接近一般公平态度。',
  ],
  sourceNotes: ['Güth, Schmittberger & Schwarze (1982) 最后通牒博弈；Forsythe et al. (1994)。'],
  rightsProvenance: 'internal-generated',
}
