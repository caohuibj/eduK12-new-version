import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'cancellation',
  educationalPurpose: '在符号网格里限时找出所有目标符号并点亮它们。',
  plainAbilityHint: '视觉搜索的速度与准确性',
  interactionFamily: 'position_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '视觉划消范式（WAIS/WISC Cancellation 同构；d2/符号划消家族）；主要构念为选择性/持续视觉注意；命中率与误报率须同读（信号检测框架）。网格由服务端按 seed+scan 重建，命中/误报为服务端求交结果。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载轮次、时长与网格差异，不得改 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '触控/鼠标点击精度影响误报。',
    '限时任务的剩余时间压力因人而异。',
  ],
  sourceNotes: ['WAIS/WISC Cancellation 分测验结构；d2 注意测验同族。'],
  rightsProvenance: 'internal-generated',
}
