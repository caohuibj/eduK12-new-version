import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'sst',
    educationalPurpose: '快速响应，但听到停止信号时要立刻"刹车"。',
    plainAbilityHint: '动作的停止控制',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '停止信号任务；主要构念为动作取消（SSRT 估计）。',
    knownLimitations: [
      'SSRT 为模型估计，依赖 p(respond|stop) 处于合理区间。',
      '策略性减慢会由质量标记提示。',
    ],
    sourceNotes: ['Logan & Cowan (1984) race model。'],
    rightsProvenance: 'internal-generated',
  }
