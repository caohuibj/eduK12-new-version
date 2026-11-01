import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "sentencecheck",
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
  schemaVersion: 1,
  testType: 'sentencecheck',
  engineVersion: '1.1.0',
  scoringVersion: '1.1.0',
  declaredMaturity: 'PILOT',
  claimScope: null,
  protocolApplicability: '自编中文单属性句图核对；真假与否定交叉安排，按冻结种子重建刺激。条件纠正不等于标准范式复现或心理测量学验证。',
  knownLimitations: ['有限模板、阅读熟练度、设备与输入方式影响本次记录。', '用时差是描述性条件差，不能作为否定加工的因果效应；不与旧版记录直接比较。', '尚无本项目版本的信效度、诊断或年龄常模依据。'],
  evidence: [],
})
