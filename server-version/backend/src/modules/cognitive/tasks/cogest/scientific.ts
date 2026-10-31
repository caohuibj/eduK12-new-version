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

scientificGovernance.push({"schemaVersion": 1, "testType": "cogest", "engineVersion": "1.1.0", "scoringVersion": "1.1.0", "declaredMaturity": "PILOT", "claimScope": null, "protocolApplicability": "根据日常经验估计现实数量的合理量级", "knownLimitations": ["内部原创材料，未标定难度，无常模、诊断或能力排名。重复施测可能受练习影响。", "选择式估算混合一般知识、文化经验与合理性判断；不是标准临床测验。当前仅20题候选，尚不能支撑原30/36题协议。"], "evidence": []})
