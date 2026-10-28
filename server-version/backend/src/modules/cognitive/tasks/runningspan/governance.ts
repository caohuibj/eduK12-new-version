import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'runningspan',
  educationalPurpose: '字母一个接一个出现、不知道何时停，任务是在心里一直保留“最近的几个”。',
  plainAbilityHint: '在干扰下持续更新并按序回忆',
  interactionFamily: 'item_ordering',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '运行记忆广度范式（running span，Bunting 2003）；主要构念为工作记忆更新；串行严格计分，侵入率与正确率须同读。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载难度差异（recallLength、list 范围、stimulusMs），不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '回忆策略（组块/复述）影响成绩。',
    '回忆阶段自定速，用时只作描述。',
  ],
  sourceNotes: ['Bunting (2003) J Exp Psychol Learn Mem Cognit；Pollack, Johnson & Knaff (1959) 运行广度起源。'],
  rightsProvenance: 'internal-generated',
}
