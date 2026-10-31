import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'embeddedfigures',
  educationalPurpose: '先看一个目标三角形，再在复杂图形场里点出它的藏身之处。',
  plainAbilityHint: '在复杂背景中保持简单形状',
  interactionFamily: 'position_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '嵌入图形范式（Embedded Figures；Witkin 场独立性传统；pymetrics Shapes 同族）；主要构念为知觉去干扰（在复杂场中保持简单形状）；题源双轨：前 4 题为冻结几何题库（跨 seed 稳定），其余按 session seed 生成；目标 id 由服务端按 seed+index 重建推导。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载试次数与几何复杂度差异，不得改生成器版本、scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '点击命中多边形为顶层面板，重叠处点击可能命中干扰项。',
    '生成题的干扰相似度未做逐题标定。',
  ],
  sourceNotes: ['Witkin 嵌入图形测验（EFT）范式结构；pymetrics Shapes 同族；题目为内部生成。'],
  rightsProvenance: 'internal-generated（几何生成器）',
}
