import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'cardsort',
    educationalPurpose: '按不断变化的规则把卡片分到正确的一边。',
    plainAbilityHint: '规则切换与坚持',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '双规则显式转换分类范式；主要构念为规则转换与持续性错误。',
    knownLimitations: [
      '持续性错误由冻结规则推导，不等同临床卡片分类测验。',
      '与 Task Switching 部分指标重叠。',
    ],
    sourceNotes: ['Grant & Berg (1948) WCST 传统（本实现为显式规则变体）。'],
    rightsProvenance: 'internal-generated',
  }
