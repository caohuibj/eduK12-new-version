import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'auditorynback',
  educationalPurpose: '听一段连续的音，每当新音和「往前第二个」一样时按键。',
  plainAbilityHint: '听觉工作记忆',
  interactionFamily: 'button_choice',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '听觉 n-back 范式（纯音序列；auditory tone n-back；Jaeggi/Gazzaley 同族）；主要构念为听觉信息的滑动窗口保持与更新（工作记忆更新）。音集为 5 个充分分离的纯音（frozen config），位置 i（i≥n）按 targetRatio 决定是否与第 i−n 音相同；命中/误报按 Hautus 校正换算 d′，音序列由服务端按 randomSeed 重建、客户端回显仅审计（不一致触发 stimulusEchoMismatch）。与既有视觉字母 n-back（nback）与视觉数字倒背（digitbackward）在模态与材料上不重叠。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载 n 水平与试次差异（如儿童 1-back），不得改 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '音频输出延迟影响 rt 对齐，但命中/误报判定不受影响；audioLatencyMs 随试次留痕。',
    '音高辨别困难（听力或播放设备问题）会被误判为记忆失败，施测前需完成音量自检。',
    '练习未通过者的 d′ 可能反映规则理解而非记忆容量。',
  ],
  sourceNotes: ['Auditory tone n-back 经典范式；Jaeggi et al. (2008) 与 Gazzaley 实验室同族任务。', 'd′ 采用 Hautus 校正（loglinear）。'],
  rightsProvenance: 'internal-generated',
}
