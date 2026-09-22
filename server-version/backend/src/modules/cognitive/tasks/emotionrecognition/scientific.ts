import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "emotionrecognition",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "六类合成面孔的分类结果受刺激生成方式、类别可辨识度、年龄和文化背景影响。",
        "本任务不测量共情、人格、文化能力或临床状态，也没有人口常模。",
        "当前刺激为内部合成成人面孔；结果只能解释为对当前冻结刺激集的分类表现。"
    ],
    "evidence": []
  }
]
