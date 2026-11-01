import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
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
  }
]
