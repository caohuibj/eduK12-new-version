import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "numberline",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  }
]

scientificGovernance.push({
  ...scientificGovernance[0], engineVersion: '1.1.0', scoringVersion: '1.1.0', declaredMaturity: 'PILOT', claimScope: null,
  protocolApplicability: 'Siegler & Opfer 2003 NP数字适配，仅单范围六个原选点和预定4/30秒；非完整NP/PN双session研究。',
  knownLimitations: ['原文DOI 10.1111/1467-9280.02438，已核作者托管Method。仅复用数值设置，不复制工作册或题图。', '未复现PN、物理25厘米纸线或跨次平衡；六点只作描述性记录，不能判定个人表征类型或年龄常模。', '一题中性练习只熟悉点击，无正确位置反馈或通过门槛；数字界面/输入方式与纸笔不同，未做实机时序校准。'],
})
