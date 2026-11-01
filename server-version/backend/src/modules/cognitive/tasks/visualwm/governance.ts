import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'visualwm',
  educationalPurpose: '记住几个彩色方块的颜色，判断其中一个有没有变。',
  plainAbilityHint: '视觉信息的短暂保持与比较',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '变化觉察范式（Change Detection；Luck & Vogel 1997 结构）；主要构念为视觉工作记忆容量；命中率与误报率按信号检测框架同读。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载集合大小与试次数差异，不得改 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '颜色显示的屏幕校准差异影响颜色辨别。',
    '言语编码策略（给颜色命名）会改变任务性质。',
  ],
  sourceNotes: ['Luck & Vogel (1997) Nature 变化觉察范式。'],
  rightsProvenance: 'internal-generated',
}
