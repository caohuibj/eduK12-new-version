import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'seriescomplete',
  educationalPurpose: "发现数列或字母序列的简洁变化规律并选择下一项",
  plainAbilityHint: "发现数列或字母序列的简洁变化规律并选择下一项",
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: "1.1.0 为项目原创、线索明确的内部任务；不是标准化测验。1.0.0 仅作历史兼容。",
  knownLimitations: ["内部原创材料，未标定难度，无常模、诊断或能力排名。重复施测可能受练习影响。"],
  sourceNotes: ['Project-original 1.1.0; per-item rule/assumptions and solution are in bank-v1.1.ts; no proprietary item bank copied.'],
  rightsProvenance: 'internal-generated',
}
