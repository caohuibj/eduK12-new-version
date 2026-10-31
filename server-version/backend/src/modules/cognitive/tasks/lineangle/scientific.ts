import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "lineangle",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  }
]

scientificGovernance.push({ ...scientificGovernance[0], engineVersion: '2.0.0', scoringVersion: '2.0.0', knownLimitations: ['项目自开发平行匹配任务，不是Benton标准测验或其常模。', '短版12次、科研60次；新旧序列/计分语义不可直接比较。'] })
