import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'gonogo',
    educationalPurpose: '见到 Go 快速按下，见到 No-Go 忍住不按。',
    plainAbilityHint: '该动才动的反应控制',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: 'Go/No-Go 范式；主要构念为反应抑制（action withholding）。',
    knownLimitations: [
      'Go RT 只解释速度-准确权衡，不能单独代表抑制能力。',
      'No-Go 试次比例影响误按率稳定性。',
    ],
    sourceNotes: ['Go/No-Go 经典范式；Wessel (2018) Psychophysiology 综述。'],
    rightsProvenance: 'internal-generated',
  }
