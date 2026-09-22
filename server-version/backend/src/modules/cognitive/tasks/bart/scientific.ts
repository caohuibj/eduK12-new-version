import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "bart",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "BART 指标受奖励框架、任务熟悉度、动画节奏和设备交互影响。",
        "所有指标仅作描述，不支持风险高低、冲动性、人格或临床分类。",
        "历史 1.0.0 两个平均泵压指标存在 integer 元数据兼容告警；该 identity 不应作为新的正式发布版本。"
    ],
    "evidence": []
  },
  {
    "schemaVersion": 1,
    "testType": "bart",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "BART 指标受奖励框架、任务熟悉度、动画节奏和设备交互影响。",
        "所有指标仅作描述，不支持风险高低、冲动性、人格或临床分类。",
        "历史 1.0.0 两个平均泵压指标存在 integer 元数据兼容告警；该 identity 不应作为新的正式发布版本。"
    ],
    "evidence": []
  }
]
