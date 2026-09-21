import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const mentalrotationCatalogEntry = {
    testType: 'mentalrotation',
    educationalPurpose: '判断两个图形是不是同一个（只是转了个角度）。',
    plainAbilityHint: '头脑中的空间旋转',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '心理旋转范式；主要构念为 mental rotation（angle cost）。',
    knownLimitations: [
      '角度代价只在小/大角度都有足够正确反应时解释。',
      '不代表完整空间智力。',
    ],
    sourceNotes: ['Shepard & Metzler (1971)。'],
    rightsProvenance: 'internal-generated（SVG 生成器）',
  } satisfies CognitiveLibraryCatalogEntry
