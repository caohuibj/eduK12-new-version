import type { CognitiveGovernanceV1 } from '../../onboarding/governance'
import { scientificGovernanceV11 } from './scientific.v11'

export const scientificGovernance: CognitiveGovernanceV1[] = [
  {
    "schemaVersion": 1,
    "testType": "visualwm",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "declaredMaturity": "PILOT",
    "claimScope": null,
    "protocolApplicability": "",
    "knownLimitations": [],
    "evidence": []
  },
  ...scientificGovernanceV11,
]
