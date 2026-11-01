import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "lineangle",
    "configVersion": "1.0.0",
    "name": "Line Orientation Matching v1.0.0 (15° steps, 4 options, 30 trials)",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 30,
      "angleStepDeg": 15,
      "optionCount": 4,
      "minAngleSepSteps": 2,
      "fixationMs": 500,
      "timeoutMs": 8000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "simulated",
        "referenceVersion": "sim-k12-v0.1",
        "referenceBand": "K7-9"
      }
    }
  },
  {
    "testType": "lineangle",
    "configVersion": "2.0.0",
    "name": "无向线段匹配 v2（15°，4选项，30次）",
    "status": "DRAFT",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "config": {
      "totalTrials": 30,
      "angleStepDeg": 15,
      "optionCount": 4,
      "minAngleSepSteps": 2,
      "fixationMs": 500,
      "timeoutMs": 8000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "2.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "lineangle",
    "configVersion": "2.0.0-report3",
    "name": "线条方向判断 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "2.0.0",
    "scoringVersion": "2.0.0",
    "config": {
      "totalTrials": 30,
      "angleStepDeg": 15,
      "optionCount": 4,
      "minAngleSepSteps": 2,
      "fixationMs": 500,
      "timeoutMs": 8000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
