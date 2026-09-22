import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "pairedassociate",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "学习表现受符号可辨识度、位置呈现、设备尺寸和练习影响。",
        "内部非语言刺激不等同 CANTAB PAL，也不支持海马功能或临床记忆分类。",
        "延迟阶段缺失必须保留为缺失，不得按零分解释。"
    ],
    "evidence": []
  }
]
