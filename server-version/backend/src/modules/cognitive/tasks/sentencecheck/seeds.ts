import type { CognitiveSeed } from '../../task-seed.types'

// Original C/S/R declarations remain addressable; R3 is explicit per identity.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "sentencecheck",
    "configVersion": "1.0.1",
    "name": "Sentence-Picture Verification v1.0.1 (30 trials, 50% negated)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 30,
      "trueRatio": 0.5,
      "negationRatio": 0.5,
      "fixationMs": 500,
      "timeoutMs": 8000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "sentencecheck",
    "configVersion": "1.1.0",
    "name": "Sentence-Picture Verification v1.1.0 (30 trials, crossed truth and polarity)",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 30,
      "trueRatio": 0.5,
      "negationRatio": 0.5,
      "fixationMs": 500,
      "timeoutMs": 8000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "1.1.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "sentencecheck",
    "configVersion": "1.0.1-report3",
    "name": "核对一句话和一幅图 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 30,
      "trueRatio": 0.5,
      "negationRatio": 0.5,
      "fixationMs": 500,
      "timeoutMs": 8000,
      "validRtFloorMs": 300,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "sentencecheck",
    "configVersion": "1.1.0-report3",
    "name": "句图验证推理 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 30,
      "trueRatio": 0.5,
      "negationRatio": 0.5,
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
