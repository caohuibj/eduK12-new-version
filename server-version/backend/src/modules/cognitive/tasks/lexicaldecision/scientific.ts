import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "lexicaldecision",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "反应时和正确率受词长、内部词频带、地区语言经验和设备输入延迟影响。",
        "内部真词/伪词库不是标准化词汇量或阅读测验，也没有年龄常模。",
        "PILOT 阶段不输出阅读能力、语言障碍、词汇量或智力结论。"
    ],
    "evidence": []
  }
]
