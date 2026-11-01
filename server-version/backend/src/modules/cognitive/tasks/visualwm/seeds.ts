import type { CognitiveSeed } from '../../task-seed.types'

// Original C/S/R declarations remain addressable; R3 is explicit per identity.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "visualwm",
    "configVersion": "1.0.1",
    "name": "Change Detection v1.0.1 (16 trials, set size 3-6)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 16,
      "studyMs": 500,
      "retentionMs": 900,
      "validRtFloorMs": 200,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "visualwm",
    "configVersion": "1.1.0",
    "name": "Change Detection v1.1.0 (independent two-item practice; formal set size 3-6)",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 16,
      "studyMs": 500,
      "retentionMs": 900,
      "validRtFloorMs": 200,
      "report": {
        "reportVersion": "1.1.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "visualwm",
    "configVersion": "1.0.1-report3",
    "name": "短暂看过颜色，还能发现变化吗 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 16,
      "studyMs": 500,
      "retentionMs": 900,
      "validRtFloorMs": 200,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "visualwm",
    "configVersion": "1.1.0-report3",
    "name": "视觉工作记忆 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 16,
      "studyMs": 500,
      "retentionMs": 900,
      "validRtFloorMs": 200,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
