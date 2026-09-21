import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
    testType: 'trailmaking',
    educationalPurpose: '按顺序尽快找到并连接下一个目标。',
    plainAbilityHint: '视觉搜索与顺序连接',
    interactionFamily: 'click_sequence',
    rtSensitivity: 'moderate',
    fineMotorSensitivity: 'high',
    adminScientificNotes: 'Trail Making 类视觉搜索 + 集合转换；v1 taxonomy 无对应 domain，standalone 报告。',
    knownLimitations: [
      '完成时间受设备、指针方式与动作速度影响，不做设备校正。',
      '总时间不解释为纯执行功能。',
    ],
    sourceNotes: ['Reitan (1958) TMT 传统（内部逐步点击实现）。'],
    rightsProvenance: 'internal-generated',
  }
