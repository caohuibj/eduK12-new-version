import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "seqlearn",
    "configVersion": "1.0.1",
    "name": "Serial Reaction Time v1.0.1 (60 trials, block 10, random block 4)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 60,
      "trialsPerBlock": 10,
      "patternSequence": [
        3,
        1,
        4,
        2,
        1,
        3,
        2,
        4,
        1,
        2
      ],
      "randomBlockIndices": [
        4
      ],
      "fixationMs": 300,
      "stimulusMs": 1200,
      "timeoutMs": 1500,
      "validRtFloorMs": 150,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "seqlearn",
    "configVersion": "1.0.1-report3",
    "name": "重复操作中，有没有逐渐熟悉 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 60,
      "trialsPerBlock": 10,
      "patternSequence": [
        3,
        1,
        4,
        2,
        1,
        3,
        2,
        4,
        1,
        2
      ],
      "randomBlockIndices": [
        4
      ],
      "fixationMs": 300,
      "stimulusMs": 1200,
      "timeoutMs": 1500,
      "validRtFloorMs": 150,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
