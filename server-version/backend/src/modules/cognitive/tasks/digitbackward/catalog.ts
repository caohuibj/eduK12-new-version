import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const digitbackwardCatalogEntry = {
    testType: 'digitbackward',
    educationalPurpose: '把看到的数字倒着顺序回忆出来。',
    plainAbilityHint: '数字的倒序操作',
    interactionFamily: 'keypad_sequence',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'Backward digit span；主要构念为工作记忆操纵（verbal manipulation）。',
    knownLimitations: [
      '与顺背分开呈现，不合并为完整工作记忆。',
      '结果不是 Wechsler 分数或常模。',
    ],
    sourceNotes: ['Backward span 经典范式（公开文献描述）。'],
    rightsProvenance: 'internal-generated',
  } satisfies CognitiveLibraryCatalogEntry
