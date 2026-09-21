import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const reactionCatalogEntry = {
    testType: 'reaction',
    educationalPurpose: '对简单视觉信号尽快做出反应，练习快速启动。',
    plainAbilityHint: '反应速度与稳定性',
    interactionFamily: 'button_choice',
    rtSensitivity: 'high',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '经典简单反应时范式；主要构念为加工速度（simple response）。',
    knownLimitations: [
      '成绩由感知-决策-动作链路速度决定，不等于学习能力或智力。',
      '提前反应与遗漏会改变指标解释，需结合质量标记阅读。',
    ],
    sourceNotes: ['简单反应时经典范式；Luce (1986) Response Times 综述。'],
    rightsProvenance: 'internal-generated（无外部刺激资产）',
  } satisfies CognitiveLibraryCatalogEntry
