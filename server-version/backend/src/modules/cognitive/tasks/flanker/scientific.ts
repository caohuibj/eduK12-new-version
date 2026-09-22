import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "flanker",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "干扰效应必须与 congruent/incongruent 准确率共同解释，存在速度—准确权衡。",
        "内部箭头刺激不等同 NIH Toolbox Flanker，也不能单独用于注意或抑制困难诊断。",
        "PILOT 阶段没有人口常模、年龄校正或临床 cut-off。"
    ],
    "evidence": []
  }
]
