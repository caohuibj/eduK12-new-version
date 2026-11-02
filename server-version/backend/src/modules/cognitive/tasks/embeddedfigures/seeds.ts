import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
// The final DRAFT-only legacy seed copies fixtures/1.0.0-1.0.0.json for exact-identity
// onboarding; it does not publish or recommend the historical task for creation.
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
  },
  {
    "testType": "embeddedfigures",
    "configVersion": "1.0.0-onboarding",
    "name": "Embedded figures 1.0.0 historical fixture (not recommended)",
    "status": "DRAFT",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 4,
      "stimulusSetVersion": "embeddedfigures-zh-v1.0.0",
      "showTargetMs": 3000,
      "timeoutMs": 15000,
      "validRtFloorMs": 400,
      "report": {
        "reportVersion": "1.0.0",
        "referenceMode": "none"
      }
    }
  }
]
