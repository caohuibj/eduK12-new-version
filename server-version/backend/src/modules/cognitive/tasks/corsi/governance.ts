import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'corsi',
    educationalPurpose: '记住方块亮起的顺序，再按同样顺序点回来。',
    plainAbilityHint: '视空间记忆',
    interactionFamily: 'click_sequence',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'Corsi Block-Tapping 范式；主要构念为视空间短时存储。',
    knownLimitations: [
      '与数字广度分开解释，不合并记忆总分。',
      '屏幕布局差异会影响序列难度。',
    ],
    sourceNotes: ['Corsi (1972)；Kessels et al. (2000) 标准化讨论。'],
    rightsProvenance: 'internal-generated',
  }
