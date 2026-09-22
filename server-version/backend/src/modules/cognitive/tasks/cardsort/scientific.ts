import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "cardsort",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "规则切换成本和持续性错误受规则理解、练习和设备交互影响。",
        "本任务不是 Wisconsin Card Sorting Test 或 NIH DCCS 的等价实现。",
        "PILOT 阶段只描述当前双规则分类任务，不支持临床执行功能判断。"
    ],
    "evidence": []
  }
]
