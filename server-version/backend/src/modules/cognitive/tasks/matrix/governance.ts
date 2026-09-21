import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'matrix',
    educationalPurpose: '找出图形排列的规律，选出合适的答案。',
    plainAbilityHint: '图形规律推理',
    interactionFamily: 'multi_option_selection',
    rtSensitivity: 'low',
    fineMotorSensitivity: 'low',
    adminScientificNotes: '内部生成矩阵推理题库；主要构念为规则归纳（fluid reasoning 任务表现）。',
    knownLimitations: [
      '正确率不换算 IQ、不与 Raven 等价。',
      '题库唯一解与难度标签依赖冻结生成器版本。',
    ],
    sourceNotes: ['Matrix reasoning 范式传统（内部题库）。'],
    rightsProvenance: 'internal-generated（SVG 生成器）',
  }
