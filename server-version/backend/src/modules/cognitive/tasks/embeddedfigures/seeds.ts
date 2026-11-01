import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "embeddedfigures",
    "configVersion": "1.1.0",
    "name": "嵌入图形 1.1.0 · 自编线条图块匹配",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 10,
      "stimulusSetVersion": "embeddedfigures-zh-v1.1.0",
      "showTargetMs": 3000,
      "timeoutMs": 15000,
      "validRtFloorMs": 400,
      "report": {
        "reportVersion": "1.1.0",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "embeddedfigures",
    "configVersion": "1.1.0-report3",
    "name": "嵌入图形 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "config": {
      "totalTrials": 10,
      "stimulusSetVersion": "embeddedfigures-zh-v1.1.0",
      "showTargetMs": 3000,
      "timeoutMs": 15000,
      "validRtFloorMs": 400,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
