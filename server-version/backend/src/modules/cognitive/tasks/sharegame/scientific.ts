import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

// Materialized declaration: existing exported values are preserved.
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "sharegame",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  },
  {
    "schemaVersion": 1,
    "testType": "sharegame",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
      "只描述有效选择；部分未答时分母改变，不能与旧版缺失补零结果直接比较。",
      "无已验证常模，不作人格或品德判断。"
    ],
    "evidence": []
  }
]
