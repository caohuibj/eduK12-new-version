import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "reversallearning",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "反转成本和 criterion 达成率受反馈概率、阶段长度、策略和任务理解影响。",
        "criterion 未达到时相关指标必须保持缺失，不得解释为零分或稳定人格特征。",
        "PILOT 阶段不输出人格、冲动性、风险偏好、学习能力等级或诊断结论。"
    ],
    "evidence": []
  }
]
