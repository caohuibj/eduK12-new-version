import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const nbackCatalogEntry = {
    testType: 'nback',
    educationalPurpose: '记住"刚才第 N 个"是什么，并实时判断匹配。',
    plainAbilityHint: '脑中实时更新信息的能力',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'N-Back 范式；主要构念为工作记忆更新；按 N 分层解释。',
    knownLimitations: [
      '不同 N 水平难度差异大，触顶/触底需质量标记提示。',
      'maxReliableN 不是标准化工作记忆等级。',
    ],
    sourceNotes: ['Kirchner (1958)；Owen et al. (2005) meta 分析。'],
    rightsProvenance: 'internal-generated',
  } satisfies CognitiveLibraryCatalogEntry
