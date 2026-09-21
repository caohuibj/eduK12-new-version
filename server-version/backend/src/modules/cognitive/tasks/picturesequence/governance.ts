import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'picturesequence',
    educationalPurpose: '记住一组图片事件的发生顺序并还原。',
    plainAbilityHint: '事件顺序的记忆',
    interactionFamily: 'item_ordering',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '图片序列学习；主要构念为序列学习与顺序保持；延迟仅科研档。',
    knownLimitations: [
      '延迟保持缺失不等于低分。',
      '项目内容的文化适宜性与理解度需 pilot 审查。',
    ],
    sourceNotes: ['序列学习与顺序记忆范式（内部设计）。'],
    rightsProvenance: 'internal-generated 场景刺激',
  }
