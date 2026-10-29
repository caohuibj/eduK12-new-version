import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'maze',
  educationalPurpose: '在迷宫中从左上角走到右下角，尽量走最短路径。',
  plainAbilityHint: '空间导航与路线规划',
  interactionFamily: 'click_sequence',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '迷宫学习范式（maze navigation；Morris Water Maze 电脑化类似物；递归回溯生成算法）；主要构念为空间导航与路线规划；迷宫结构由服务端按 seed+mazeIndex 重建（递归回溯），最优路径由 BFS 计算，路径合法性由服务端逐步验证。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载迷宫尺寸与轮次差异，不得改生成算法版本、scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '屏幕尺寸影响迷宫显示和导航体验。',
    '策略差异（右手法则 vs 目标导向）影响路径效率。',
  ],
  sourceNotes: ['Maze navigation 经典范式；递归回溯迷宫生成算法（标准算法）。'],
  rightsProvenance: 'internal-generated',
}
