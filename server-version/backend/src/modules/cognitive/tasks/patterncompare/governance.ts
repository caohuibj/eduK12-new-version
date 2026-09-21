import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'patterncompare',
    educationalPurpose: '在有限时间里快速判断两个图形是不是一样。',
    plainAbilityHint: '图形快速比较的速度',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'moderate',
    adminScientificNotes: 'Pattern Comparison 加工速度范式；内部自制几何刺激。',
    knownLimitations: [
      '速度指标必须与准确率同读，快速猜测会虚高速度。',
      '限时设计对设备与输入方式敏感。',
    ],
    sourceNotes: ['Salthouse (1996) 加工速度传统（Pattern Comparison 类任务）。'],
    rightsProvenance: 'internal-generated（几何图形生成器）',
  }
