import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "auditorynback",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  }
]

scientificGovernance.push({...structuredClone(scientificGovernance[0]), engineVersion: '1.1.0', scoringVersion: '1.1.0', knownLimitations: ['固定目标数仅修复结构性机会不足；没有验证信效度、常模或训练效果。', '五频音集、500毫秒声音和2秒名义节奏，不是Gao等2020原协议复刻。']})
