import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'sentencecheck',
  educationalPurpose: '读一句关于图形的话，判断它和图片是否相符。',
  plainAbilityHint: '理解句子（含否定）并与事实核对',
  interactionFamily: 'button_choice',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '句图验证/语法推理范式（Baddeley 1984；Cambridge Brain Sciences Grammatical Reasoning 同族）；主要构念为句法语义核对（含否定）；否定句代价为有符号量。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载模板与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '语言阅读熟练度是已知混淆。',
    '模板集有限（3 形状 × 4 颜色），重复 exposure 带来学习效应。',
  ],
  sourceNotes: ['Baddeley (1984) Br J Psychol 句图验证范式。'],
  rightsProvenance: 'internal-generated',
}
