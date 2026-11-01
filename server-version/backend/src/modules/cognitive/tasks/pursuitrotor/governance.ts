import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'pursuitrotor',
  educationalPurpose: '一个点在圆轨道上匀速转动，用指针尽量跟着它走。',
  plainAbilityHint: '手眼协调与视觉追踪',
  interactionFamily: 'position_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'high',
  adminScientificNotes: '追踪旋转范式（Pursuit Rotor；PEBL 同族；经典感觉运动任务）；主要构念为视觉引导的精细运动追踪；路径为冻结圆轨恒速，追踪时间比由服务端换算。本任务为连续运动任务，非离散选择。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载转速、时长与轮次差异，不得改 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '鼠标/触控的采样率与延迟影响时间比精度。',
    '设备差异（触屏 vs 鼠标）导致追踪表现不可直接比较。',
  ],
  sourceNotes: ['Pursuit Rotor 经典范式；PEBL Test Battery 同族（Mueller & Piper 2014）。'],
  rightsProvenance: 'internal-generated',
}
