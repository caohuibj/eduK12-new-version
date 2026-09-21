import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const cptCatalogEntry = {
    testType: 'cpt',
    educationalPurpose: '长时间盯住屏幕，目标一出现就快速准确响应。',
    plainAbilityHint: '持续注意力',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'CPT-X 持续操作范式；主要构念为持续注意（辨别/遗漏/稳定性）。',
    knownLimitations: [
      '时长与负荷影响成绩，跨 profile 不可直接比较。',
      '遗漏与误报须与 d′ 同读。',
    ],
    sourceNotes: ['Rosvold et al. (1956) CPT 传统；Riccio et al. (2002) 综述。'],
    rightsProvenance: 'internal-generated',
  } satisfies CognitiveLibraryCatalogEntry
