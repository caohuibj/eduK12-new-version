import type { CognitiveSeed } from '../../task-seed.types'

export const seeds: CognitiveSeed[] = [
  {
    "testType": "matrix",
    "configVersion": "1.0.0",
    "name": "Matrix Reasoning Pilot v1.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "itemCount": 16,
      "optionCount": 4,
      "itemTimeoutMs": 30000,
      "validRtFloorMs": 300,
      "stimulusSetVersion": "matrix-generator-v1.0.0",
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "matrix",
    "configVersion": "1.1.0",
    "name": "Matrix 1.1.0 · 独立练习",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.0",
    "config": {
      "itemCount": 16,
      "optionCount": 4,
      "itemTimeoutMs": 30000,
      "validRtFloorMs": 300,
      "stimulusSetVersion": "matrix-generator-v1.0.0",
      "practiceSetVersion": "matrix-practice-v1.1.0",
      "report": {
        "reportVersion": "1.4.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "matrix",
    "configVersion": "1.0.0-report3",
    "name": "矩阵规则推理 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "itemCount": 16,
      "optionCount": 4,
      "itemTimeoutMs": 30000,
      "validRtFloorMs": 300,
      "stimulusSetVersion": "matrix-generator-v1.0.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "matrix",
    "configVersion": "1.1.0-report3",
    "name": "矩阵规则推理 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.0",
    "config": {
      "itemCount": 16,
      "optionCount": 4,
      "itemTimeoutMs": 30000,
      "validRtFloorMs": 300,
      "stimulusSetVersion": "matrix-generator-v1.0.0",
      "practiceSetVersion": "matrix-practice-v1.1.0",
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
