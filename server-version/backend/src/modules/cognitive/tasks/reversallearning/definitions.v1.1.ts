import { reversallearningRegistryMeta as previous } from './definitions'

export const reversallearningV11RegistryMeta = {
  ...previous,
  profileDefinitionVersion: '1.1.0',
  profiles: {
    ...previous.profiles,
    research: {
      ...previous.profiles.research,
      configPatch: { ...previous.profiles.research.configPatch, trialTimeoutMs: 2000, practiceTrialCount: 30, practiceAcquisitionOnly: true },
      reportCaveats: ['研究变式：30题无反转概率练习、2秒响应、500毫秒反馈；仍是固定一次反转，不是Cools 2002三组多次反转协议。'],
    },
  },
  reportDefinitionVersion: '1.1.0',
  reportDefinition: {
    ...previous.reportDefinition,
    showProductIndex: false,
    disclaimer: '项目概率反转研究变式：统一负反馈，不在界面透露阶段。研究档30题练习、每题2秒；仍非原研究完整复刻，不用于人格、风险或临床结论。',
  },
}
