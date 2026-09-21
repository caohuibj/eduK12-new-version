import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const flankerCatalogEntry = {
    testType: 'flanker',
    educationalPurpose: '忽略两边箭头的干扰，只判断中间箭头的方向。',
    plainAbilityHint: '干扰中的方向判断',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'Eriksen Flanker 范式；主要构念为知觉干扰控制。',
    knownLimitations: [
      '干扰效应须与两条件准确率同读。',
      '与 Stroop/SST 构念部分重叠，宜作三角互证而非替代。',
    ],
    sourceNotes: ['Eriksen & Eriksen (1974)。'],
    rightsProvenance: 'internal-generated',
  } satisfies CognitiveLibraryCatalogEntry
