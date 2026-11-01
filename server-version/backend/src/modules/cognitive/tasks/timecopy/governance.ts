import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'timecopy',
  educationalPurpose: '先看一段光亮了多久，再用同样的时长复制出来。',
  plainAbilityHint: '对时间间隔的感知与复现',
  interactionFamily: 'incremental_button',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '时间间隔复制范式（reproduction，Grondin 2010 综述；pymetrics Lengths 同族）；主要构念为间隔计时；相对误差与方向偏差须同读，偏差为有符号量。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载目标范围与试次数差异，不得改动 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '默数/节律策略改变计时方式，属个体差异而非误差。',
    '设备输入延迟影响起止时间记录。',
  ],
  sourceNotes: ['Grondin (2010) Atten Percept Psychophys 时间知觉综述。'],
  rightsProvenance: 'internal-generated',
}
