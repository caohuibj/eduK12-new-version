import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'icarmatrix',
  educationalPurpose: '观察 3×3 图形矩阵的行列规律，从六个选项里选出右下角缺的图形。',
  plainAbilityHint: '图形规律归纳与推理',
  interactionFamily: 'multi_option_selection',
  rtSensitivity: 'low',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '当前推荐 engine 2.1.0 / scoring 1.1.0：从原 matRiks 0.1.5 程序生成素材中选用七道已查看的 3×3 题；体验/标准/科研为4/6/7题，均覆盖形状、旋转、填充。不是原版 ICAR 全套。1.0.0 与2.0.0只为冻结历史会话保留，不继续推荐新建。未声称年龄适配或各配置等值。',
  knownLimitations: ['未建立年龄常模、逐题难度、信效度或等值证据。', '七题库有限，重复施测可能产生记忆与练习效应；不换算IQ、百分位或诊断。'],
  sourceNotes: [
    'matRiks 0.1.5, MIT + LICENSE, copyright 2023 matRiks authors: https://github.com/OttaviaE/matRiks',
    'ICAR、Sandia MatGen仅为原候选的范式背景，未导入其标准题目；MaRs-IB原材料非商业条件，不纳入本次公开题库。',
    '逐题保留/排除理由、精确原素材来源与许可边界见 tasks/icarmatrix/AUDIT.md。',
  ],
  rightsProvenance: 'Procedurally generated matRiks-derived assets, MIT generator attribution retained; not original ICAR/Raven/MaRs-IB items. See tasks/icarmatrix/THIRD_PARTY_NOTICES.md.',
}
