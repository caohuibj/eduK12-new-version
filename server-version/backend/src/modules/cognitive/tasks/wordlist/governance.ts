import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'wordlist',
    educationalPurpose: '记住一组词语，然后凭记忆打出来。',
    plainAbilityHint: '词语记忆',
    interactionFamily: 'typed_recall',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'moderate',
    adminScientificNotes: '中文词表自由回忆；v1 taxonomy 无对应 domain，standalone；词库不可跨语言共享参考。',
    knownLimitations: [
      '词频与教育暴露影响成绩，不能跨语言/地区直接比较。',
      '输入归一化只清理格式/空白/标点与英文大小写。',
    ],
    sourceNotes: ['自由回忆范式（内部中文词库 chinese-wordlist-v1.0.0）。'],
    rightsProvenance: 'internal-generated 冻结词库',
  }
