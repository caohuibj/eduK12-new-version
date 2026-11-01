import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "logicdeduce",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  }
]

scientificGovernance.push({...scientificGovernance[0],engineVersion:'2.0.0',scoringVersion:'2.0.0',protocolApplicability:'项目原创中文四选一试点；18/30/36正式题，独立练习1题；非标准化能力测验。',knownLimitations:['题目难度等级未经实测校准；同一36题池重复施测有练习效应。','时长为协议估计，不提供排名、常模、诊断或已验证的信效度。']})
