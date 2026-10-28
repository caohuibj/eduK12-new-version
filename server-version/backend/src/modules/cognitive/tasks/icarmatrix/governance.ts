import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'icarmatrix',
  educationalPurpose: '观察 3×3 图形矩阵的行列规律，从六个选项里选出右下角缺的图形。',
  plainAbilityHint: '图形规律归纳与推理',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '图形矩阵推理范式（ICAR matrix reasoning 公共领域范式结构；Sandia MatGen 生成思路）；题源双轨：前 8 题为冻结手写题库（跨 seed 稳定、可横向比较），其余按 session seed 生成（重复施测不复现）；正确项由服务端按 seed+index 重建推导。与既有 matrix 任务（4 选项 itemId 题库）为不同身份。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载试次数差异，不得改生成器版本、scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '正确率不换算 IQ、不与 Raven APM 等价。',
    '生成题的难度随规则组合波动，未做逐题难度标定。',
  ],
  sourceNotes: ['ICAR matrix reasoning 公共领域范式（Condon & Revelle 2014）；生成思路参考 Sandia MatGen（Matzen et al.）；题目为内部生成。'],
  rightsProvenance: 'public-domain-paradigm; items generated internally (MatGen-inspired)',
}
