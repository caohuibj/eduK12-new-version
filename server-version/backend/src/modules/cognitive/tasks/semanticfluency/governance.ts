import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'semanticfluency',
  educationalPurpose: '限时列举同一类别的词语（如动物），看你能想起多少。',
  plainAbilityHint: '从长期记忆中按类别提取词语',
  interactionFamily: 'typed_recall',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '类别语义流畅性范式（category fluency；动物/水果；冻结词库校验，与 wordlist 的归一化口径一致）；主要构念为语义提取速度与组织策略；侵入率与产词量须同读。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载类别、时长与轮次差异，不得改动词库、scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '词库覆盖有限：词库外的真实动物/水果名会被计为侵入。',
    '打字速度与输入法影响产出量。',
  ],
  sourceNotes: ['类别流畅性范式（ category fluency，Novick 2003 综述；Lumosity Word Bubbles 同族训练形式）；词库为内部原创。'],
  rightsProvenance: 'internal-generated',
}
