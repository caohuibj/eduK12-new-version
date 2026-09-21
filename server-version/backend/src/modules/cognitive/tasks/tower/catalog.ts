import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const towerCatalogEntry = {
    testType: 'tower',
    educationalPurpose: '动脑筋用最少的步数把圆盘挪到目标位置。',
    plainAbilityHint: '做计划与提前思考',
    interactionFamily: 'click_sequence',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '塔式规划（Tower of London 类）；主要构念为规划与前瞻；solver 校验最短路径。',
    knownLimitations: [
      '解题比例、额外步数与规则违反应分开阅读。',
      '不做计划能力等级判断。',
    ],
    sourceNotes: ['Shallice (1982) Tower of London 传统（内部实现）。'],
    rightsProvenance: 'internal-generated',
  } satisfies CognitiveLibraryCatalogEntry
