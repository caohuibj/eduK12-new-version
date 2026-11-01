import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'auditorynback',
  educationalPurpose: '听一段连续的音，每当新音和「往前第二个」一样时按键。',
  plainAbilityHint: '听觉工作记忆',
  interactionFamily: 'button_choice',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '纯音2-back项目变式。旧1.0.1按概率生成；新1.1.0固定round((总音数−n)×targetRatio)个目标，种子随机安放且最多连续两个。体验22音包含2个起始音、6匹配/14非匹配；研究60音包含2起始音、17匹配/41非匹配。d′保留原Hautus修正与质量阈值；固定机会仅修复结构性不足，不能宣称已经可靠或等同原论文。',
  knownLimitations: [
    '音频输出延迟影响 rt 对齐，但命中/误报判定不受影响；audioLatencyMs 随试次留痕。',
    '音高辨别困难（听力或播放设备问题）会被误判为记忆失败，施测前需完成音量自检。',
    '练习未通过者的 d′ 可能反映规则理解而非记忆容量。',
  ],
  sourceNotes: ['Gao et al. (2020), Speech in noise perception improved by training fine auditory discrimination: far and applicable transfer of perceptual learning. DOI:10.1038/s41598-020-76295-9; https://pmc.ncbi.nlm.nih.gov/articles/PMC7653913/ （方法：40+n音、固定12目标、100毫秒音/每项2.5秒、八频音集、60dB SPL）。本项目仅借鉴固定目标机会思路，保留原五频音集与500+1500毫秒，不是完整复刻。', 'd′ 采用 Hautus 校正（loglinear）；没有本项目版本的常模或信效度实测。'],
  rightsProvenance: 'internal-generated',
}
