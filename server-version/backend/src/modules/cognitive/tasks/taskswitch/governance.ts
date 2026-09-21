import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'taskswitch',
    educationalPurpose: '按照提示在不同任务规则之间快速切换。',
    plainAbilityHint: '任务切换的灵活性',
    interactionFamily: 'button_choice',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '线索化任务转换范式；主要构念为试次级转换代价（difference 指标）。',
    knownLimitations: [
      '转换代价必须与 switch/repeat 准确率同屏阅读。',
      'mixing cost 仅科研档估计。',
    ],
    sourceNotes: ['Monsell (2003) 综述。'],
    rightsProvenance: 'internal-generated',
  }
