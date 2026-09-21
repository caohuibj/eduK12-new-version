import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'lexicaldecision',
    educationalPurpose: '尽快判断屏幕上的字符串是不是真词。',
    plainAbilityHint: '词汇识别的速度与准确性',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '中文词汇判断；v1 taxonomy 无对应 domain，standalone；与语言/结晶领域分开解释。',
    knownLimitations: [
      '高度依赖语言、词频与阅读暴露。',
      '词库与伪词生成器处于 DRAFT 审查阶段。',
    ],
    sourceNotes: ['Meyer & Schvaneveldt (1971) lexical decision 传统。'],
    rightsProvenance: 'internal-generated 冻结词库 + 伪词生成器',
  }
