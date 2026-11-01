import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "lexicaldecision",
    "configVersion": "1.0.0",
    "name": "Chinese Lexical Decision Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 100,
      "realWordRatio": 0.5,
      "stimulusMs": 1200,
      "trialTimeoutMs": 3000,
      "isiMs": 300,
      "validRtFloorMs": 150,
      "stimulusSetVersion": "zh-lexical-v1.0.0",
      "pseudowordGeneratorVersion": "zh-pseudoword-generator-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "lexicaldecision",
    "configVersion": "1.0.0-report3",
    "name": "词语快辨 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 100,
      "realWordRatio": 0.5,
      "stimulusMs": 1200,
      "trialTimeoutMs": 3000,
      "isiMs": 300,
      "validRtFloorMs": 150,
      "stimulusSetVersion": "zh-lexical-v1.0.0",
      "pseudowordGeneratorVersion": "zh-pseudoword-generator-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
