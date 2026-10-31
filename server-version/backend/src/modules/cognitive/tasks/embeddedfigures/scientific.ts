import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

const legacyScientific: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "embeddedfigures",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  }
]

export const scientificGovernance:CognitiveGovernanceV1[]=[...legacyScientific,{...legacyScientific[0],engineVersion:'1.1.0',scoringVersion:'1.1.0',
 protocolApplicability:'自编七选择线条图形匹配；同形同大小同方向，目标先呈现后移除。不是标准GEFT或L-EFT原版。',
 knownLimitations:['七选择与原量表程序不同；未经常模、信效度或题目难度标定。','仅三边轮廓，含记忆与视觉搜索、设备和首次选择因素；没有职业或诊断解释。'],
}]
