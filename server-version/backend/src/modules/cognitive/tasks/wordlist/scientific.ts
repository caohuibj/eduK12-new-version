import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "wordlist",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [
        "表现受中文输入法、输入习惯、标点/空白处理和延迟阶段完成情况影响。",
        "本任务不复制 CVLT/RAVLT，也不支持记忆能力等级、学习障碍或临床诊断。",
        "延迟阶段未完成时 delayed 指标必须保持缺失，不能按零分解释。"
    ],
    "evidence": []
  }
]
