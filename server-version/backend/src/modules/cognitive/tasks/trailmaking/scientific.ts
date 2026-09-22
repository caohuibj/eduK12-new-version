import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "trailmaking",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "完成时间同时包含视觉搜索、动作速度、设备和指针方式影响，不能解释为纯 motor 或执行功能。",
        "本任务不等同临床 Trail Making Test，也没有年龄常模或百分位。",
        "跨鼠标、触屏、触控笔和键盘比较必须保留设备/输入方式限制。"
    ],
    "evidence": []
  }
]
