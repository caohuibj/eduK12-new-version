import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "picturesequence",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "结果受场景理解、文化熟悉度和排序交互方式影响。",
        "内部场景刺激不等同 NIH Picture Sequence Memory，也不使用 NIH 常模。",
        "延迟阶段未完成时不得将缺失解释为低保持能力。"
    ],
    "evidence": []
  }
]
