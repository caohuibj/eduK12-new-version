import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "wordanalogy",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  }
]

scientificGovernance.push({
 ...scientificGovernance[0], engineVersion: '1.1.0', scoringVersion: '1.1.0',
 protocolApplicability: '原创中文题库试用，覆盖体验、标准及科研参数档；不是经验证的标准化测验。',
 knownLimitations: ['未建立群体常模、信效度及跨版本等值证据。', '词汇经验、阅读熟练度与设备输入影响表现；重复参加可能产生练习效应。'],
})
