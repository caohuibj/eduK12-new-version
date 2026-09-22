import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "patterncompare",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "速度指标同时受视觉搜索、动作方式和设备输入延迟影响，必须与准确率一起解释。",
        "内部几何刺激不等同 NIH Toolbox Pattern Comparison，也没有年龄常模或临床阈值。",
        "PILOT 阶段仅支持对本次任务表现的描述，不支持跨人群或跨设备校正。"
    ],
    "evidence": []
  }
]
