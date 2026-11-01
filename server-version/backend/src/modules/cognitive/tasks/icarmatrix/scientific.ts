import type { CognitiveGovernanceV1 } from '../../onboarding/governance'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "icarmatrix",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  },
  {
    "schemaVersion": 1,
    "testType": "icarmatrix",
    "engineVersion": "2.0.0",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  },
  {
    schemaVersion: 1, testType: 'icarmatrix', engineVersion: '2.1.0', scoringVersion: '1.1.0',
    declaredMaturity: 'PILOT', claimScope: null,
    protocolApplicability: 'Seven reviewed 3x3 procedural items; 4/6/7 item profiles, not age-adapted forms.',
    knownLimitations: ['No calibrated item difficulty, age norms, equivalence or reliability evidence.', 'Not the original ICAR standard test or MaRs-IB item bank.'],
    evidence: [],
  }
]
