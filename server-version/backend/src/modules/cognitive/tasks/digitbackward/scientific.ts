import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "digitbackward",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "倒背表现同时涉及短时保持、顺序操作和任务理解，不能代表完整工作记忆。",
        "本任务不等同 Wechsler Digit Span Backward，也没有年龄标准分。",
        "PILOT 阶段仅解释本次数字倒背任务内的 span 与正确试次。"
    ],
    "evidence": []
  }
]
