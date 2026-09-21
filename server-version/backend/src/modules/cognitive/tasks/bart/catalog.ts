import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const bartCatalogEntry = {
    testType: 'bart',
    educationalPurpose: '给气球一点点打气赚奖励，吹爆就没有了。',
    plainAbilityHint: '逐步决策的描述性观察',
    interactionFamily: 'incremental_button',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'BART 泵压范式；v1 taxonomy 无对应 domain，standalone；仅描述性指标。',
    knownLimitations: [
      '不作风险偏好、冲动性或人格判断。',
      '奖励框架与任务熟悉度影响行为。',
    ],
    sourceNotes: ['Lejuez et al. (2002) BART。'],
    rightsProvenance: 'internal-generated',
  } satisfies CognitiveLibraryCatalogEntry
