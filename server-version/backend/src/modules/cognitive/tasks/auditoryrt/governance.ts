import type { CognitiveLibraryCatalogEntry } from '../../library/catalog-contract'

export const catalog: CognitiveLibraryCatalogEntry = {
  testType: 'auditoryrt',
  educationalPurpose: '听到声音就尽快按键，看你的耳朵多快把声音送到手上。',
  plainAbilityHint: '听觉反应速度',
  interactionFamily: 'button_choice',
  rtSensitivity: 'high',
  fineMotorSensitivity: 'low',
  adminScientificNotes: '简单听觉反应时范式（Simple Auditory Reaction Time；Donders a-reaction 传统，BrainHQ 听觉处理速度同族）；主要构念为听觉信号检测到运动反应的加工速度。前瞻期 1–4s 均匀抖动且避免连续重复，抑制节奏预期；早于 150ms 为预期反应，超过 1000ms 或无反应为漏失；中位 RT 由服务端换算。Web Audio 输出延迟随试次留痕（audioLatencyMs），跨设备比较需审查。被试人群变体（儿童/青少年/成人）通过独立 configVersion 承载前瞻期与试次差异，不得改 scoringVersion 阈值或 presentationVersion 文案。',
  knownLimitations: [
    '音频输出延迟（蓝牙耳机可达 100ms+）会整体抬高 RT；audioLatencyMs 随试次留痕供审查。',
    '音量与播放设备差异影响可听性，需在安静环境与统一音量下施测。',
    '需可发声设备；静音或无音频权限的环境应终止施测而不是降级为视觉任务。',
  ],
  sourceNotes: ['Simple Auditory RT 经典范式；Donders（1868）减法反应时传统。'],
  rightsProvenance: 'internal-generated',
}
