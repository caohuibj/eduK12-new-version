import { auditorynbackRegistryMeta as previous } from './definitions'

export const auditorynbackRegistryMetaV11 = {
  ...previous,
  name: '固定机会的声音2-back（项目变式）',
  randomizationAlgorithmVersion: 'auditorynback-fixed-count-v1.1.0',
  profileDefinitionVersion: '1.1.0',
  profiles: {
    experience: { ...previous.profiles.experience, configPatch: { totalTrials: 22 }, reportCaveats: ['短版共22音，前2音只建立比较；20次比较固定6次匹配、14次非匹配。名义声音时长44秒，另加练习/反馈/保存。只描述本次记录，不代表稳定能力。'] },
    standard: { ...previous.profiles.standard, reportCaveats: ['40音含前2音，固定11次匹配、27次非匹配。项目变式，无人口常模。'] },
    research: { ...previous.profiles.research, reportCaveats: ['60音含前2音，固定17次匹配、41次非匹配。保留五音集与500+1500毫秒节奏；与Gao等2020的40+n音、12目标、100毫秒/2.5秒协议不同，属于项目研究变式，尚无本版本信效度实测。'] },
  },
  qualityDefinitionVersion: '1.1.0',
  qualityDefinitions: {...previous.qualityDefinitions, floorPerformance: {...previous.qualityDefinitions.floorPerformance, label: '本次区分指标为负', description: '本次d′为负，需结合命中/误报与操作阅读；不代表统计显著低于随机、未理解或诊断。'}},
  reportDefinitionVersion: '1.1.0',
  reportDefinition: {
    ...previous.reportDefinition,
    title: '固定机会的声音2-back（项目变式）',
    practicalTips: ['将当前音与隔一个的音比较，相同就按，不同就不按。', '先看实际匹配与非匹配机会数，再读这次反应；设备和音高辨别也会影响记录。'],
  },
}
