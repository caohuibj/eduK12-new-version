import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'cogest',
  educationalPurpose: "根据日常经验估计现实数量的合理量级",
  plainAbilityHint: "根据日常经验估计现实数量的合理量级",
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: "1.1.0 为项目原创的现实数量估算候选任务，目前仅20题，不可纳入30/36题协议；不是标准化测验。1.0.0 仅作历史兼容。",
  knownLimitations: ["内部原创材料，未标定难度，无常模、诊断或能力排名。重复施测可能受练习影响。"],
  sourceNotes: ['Project-original 1.1.0; per-item rule/assumptions and solution are in bank-v1.1.ts; no proprietary item bank copied.'],
  rightsProvenance: 'internal-generated',
}
