import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const pairedassociateCatalogEntry = {
    testType: 'pairedassociate',
    educationalPurpose: '记住每个图形对应的位置，越学越快。',
    plainAbilityHint: '图形-位置的配对学习',
    interactionFamily: 'position_selection',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '图形-位置配对学习；主要构念为联想学习（learning slope / trials to criterion）。',
    knownLimitations: [
      '延迟正确率缺失不按 0 计。',
      '内部非语言配对刺激，不等同 CANTAB PAL。',
    ],
    sourceNotes: ['Paired-associate learning 经典范式（内部实现）。'],
    rightsProvenance: 'internal-generated',
  } satisfies CognitiveLibraryCatalogEntry
