import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'stroop',
    educationalPurpose: '当颜色和文字含义"打架"时，快速说出正确的颜色。',
    plainAbilityHint: '冲突信息下的抗干扰表现',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '色词 Stroop 范式；主要构念为语义干扰控制；difference 指标须与条件准确率同读。',
    knownLimitations: [
      '阅读自动化与语言能力是已知混淆。',
      '短版本干扰效应不稳定，体验档仅供体验。',
    ],
    sourceNotes: ['Stroop (1935) J Exp Psychol；MacLeod (1991) 综述。'],
    rightsProvenance: 'internal-generated',
  }
