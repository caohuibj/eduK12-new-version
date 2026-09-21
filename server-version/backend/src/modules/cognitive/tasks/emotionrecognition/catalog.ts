import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const emotionrecognitionCatalogEntry = {
    testType: 'emotionrecognition',
    educationalPurpose: '看图片里人物的表情，选出对应的情绪。',
    plainAbilityHint: '表情的情绪分类（描述性）',
    interactionFamily: 'multi_option_selection',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '六类情绪面孔分类；v1 taxonomy 无对应 domain，standalone；内部合成面孔。',
    knownLimitations: [
      '合成面孔的文化与年龄适宜性需 pilot 审查。',
      '不作情绪能力、共情、人格或临床判断。',
    ],
    sourceNotes: ['基本情绪分类传统（Ekman 六类，内部合成刺激）。'],
    rightsProvenance: 'internal AI-synthetic faces（emotion-faces-ai-zh-v1.0.0）',
  } satisfies CognitiveLibraryCatalogEntry
