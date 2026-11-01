import type { CognitiveSeed } from '../../task-seed.types'

// Original C/S/R declarations remain addressable; R3 is explicit per identity.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "reversallearning",
    "configVersion": "1.0.0",
    "name": "Probabilistic Reversal Learning Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 120,
      "acquisitionTrials": 60,
      "reversalTrials": 60,
      "criterionConsecutiveCorrect": 6,
      "rewardProbability": 0.8,
      "trialTimeoutMs": 3000,
      "stimulusSetVersion": "reversal-symbols-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "reversallearning",
    "configVersion": "1.0.0-report3",
    "name": "跟着反馈找规律 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 120,
      "acquisitionTrials": 60,
      "reversalTrials": 60,
      "criterionConsecutiveCorrect": 6,
      "rewardProbability": 0.8,
      "trialTimeoutMs": 3000,
      "stimulusSetVersion": "reversal-symbols-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "reversallearning",
    "configVersion": "1.1.0",
    "name": "Probabilistic Reversal Project Variant v1.1.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 120,
      "acquisitionTrials": 60,
      "reversalTrials": 60,
      "criterionConsecutiveCorrect": 6,
      "rewardProbability": 0.8,
      "trialTimeoutMs": 3000,
      "stimulusSetVersion": "reversal-symbols-v1.0.0",
      "practiceTrialCount": 4,
      "practiceAcquisitionOnly": false,
      "report": {
        "reportVersion": "1.1.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "reversallearning",
    "configVersion": "1.1.0-report3",
    "name": "Probabilistic Reversal Project Variant v1.1.0 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 120,
      "acquisitionTrials": 60,
      "reversalTrials": 60,
      "criterionConsecutiveCorrect": 6,
      "rewardProbability": 0.8,
      "trialTimeoutMs": 3000,
      "stimulusSetVersion": "reversal-symbols-v1.0.0",
      "practiceTrialCount": 4,
      "practiceAcquisitionOnly": false,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
