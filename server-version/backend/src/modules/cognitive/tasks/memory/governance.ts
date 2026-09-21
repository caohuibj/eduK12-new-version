import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'memory',
    educationalPurpose: '记住越来越长的数字序列，挑战短时记忆容量。',
    plainAbilityHint: '短时记忆容量',
    interactionFamily: 'keypad_sequence',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '数字广度顺背（forward digit span）；主要构念为言语短时存储。',
    knownLimitations: [
      'maxSpan 只描述本次任务容量，不是标准化记忆等级。',
      '与倒背任务分开解释，不合并记忆总分。',
    ],
    sourceNotes: ['Digit span 经典范式；Woods et al. (2011) J Clin Exp Neuropsychol。'],
    rightsProvenance: 'internal-generated',
  }
