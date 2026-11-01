import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "wordlist",
    "configVersion": "1.0.0",
    "name": "Chinese Wordlist Free Recall Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "listLength": 12,
      "learningRounds": 3,
      "delayedEnabled": false,
      "delayedDelayMs": 60000,
      "studyMsPerWord": 800,
      "recallTimeoutMs": 60000,
      "inactivityGuardMs": 120000,
      "inputMode": "typed-free-recall",
      "normalizationVersion": "wordlist-normalization-v1.0.0",
      "stimulusSetVersion": "chinese-wordlist-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "wordlist",
    "configVersion": "1.0.0-report3",
    "name": "读过一组词后，能想起哪些 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "listLength": 12,
      "learningRounds": 3,
      "delayedEnabled": false,
      "delayedDelayMs": 60000,
      "studyMsPerWord": 800,
      "recallTimeoutMs": 60000,
      "inactivityGuardMs": 120000,
      "inputMode": "typed-free-recall",
      "normalizationVersion": "wordlist-normalization-v1.0.0",
      "stimulusSetVersion": "chinese-wordlist-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
