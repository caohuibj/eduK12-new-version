import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'cogest',
  educationalPurpose: "根据日常经验估计现实数量的合理量级",
  plainAbilityHint: "根据日常经验估计现实数量的合理量级",
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: "1.1.0 为项目自编的描述性数量级估算，36题经有限题面/区间审阅，可进入源码试测草稿及既有草稿安装准备；不是标准化临床测验。r27教育部旧页、r28专利、r35EPREL正文未由独审独立取得，不称全部引用已独立核实。1.0.0 仅作历史兼容。",
  knownLimitations: ["内部原创材料，未标定难度，无常模、诊断或能力排名。重复施测可能受练习影响。"],
  sourceNotes: ['Project-original 1.1.0; per-item rule/assumptions and solution are in bank-v1.1.ts; no proprietary item bank copied.'],
  rightsProvenance: 'internal-generated',
}
