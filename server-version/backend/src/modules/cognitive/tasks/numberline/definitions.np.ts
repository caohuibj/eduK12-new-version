import { numberlineRegistryMeta as previous } from './definitions'

export const numberlineNpRegistryMeta = {
  ...previous,
  name: '数字到位置估计（NP数字适配）', randomizationAlgorithmVersion: 'numberline-np-shuffle-v1.0.0',
  profileDefinitionVersion: '1.1.0',
  profiles: {
    experience: { profile: 'experience' as const, estimatedMinutes: [1, 5], configPatch: {}, reportCaveats: ['NP单范围六点协议；不沿用旧体验版8题，不据此解释稳定能力。'] },
    standard: { profile: 'standard' as const, estimatedMinutes: [1, 5], configPatch: {}, reportCaveats: ['范围、A/B和4或30秒由选定配置冻结，单范围单独阅读。'] },
    research: { profile: 'research' as const, estimatedMinutes: [1, 5], configPatch: {}, reportCaveats: ['仅原NP子任务的数字适配：单范围六个原选点、块内随机、预定4或30秒。没有PN或自动跨session安排，也不声称物理25厘米复刻。'] },
  },
  reportDefinitionVersion: '1.1.0',
  reportDefinition: {
    ...previous.reportDefinition, title: '数字到位置估计（NP数字适配）',
    practicalTips: ['回看这次的位置误差和回应数；研究参与者后续作答前不提供定位策略。'],
    disclaimer: '单范围六次估计，只描述本次NP记录。4/30秒、A/B与范围均冻结；不解释为年龄、数感类型或个人表征模型。',
  },
  recommendedForCreate: false,
}
