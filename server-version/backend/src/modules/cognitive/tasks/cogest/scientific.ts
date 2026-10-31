import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "cogest",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  }
]

scientificGovernance.push({"schemaVersion": 1, "testType": "cogest", "engineVersion": "1.1.0", "scoringVersion": "1.1.0", "declaredMaturity": "PILOT", "claimScope": null, "protocolApplicability": "根据生活情境中的近似线索估计数量级和单位", "knownLimitations": ["内部原创材料，未标定难度，无常模、诊断或能力排名。重复施测可能受练习影响。", "题内给定线索可通过计算求解，结果混合数量/单位知识与估算策略；不是无提示估算标准测验。"], "evidence": []})
