import type { CognitiveSeed } from '../../task-seed.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const seeds: CognitiveSeed[] = [
  {
    "testType": "symbolmatch",
    "configVersion": "1.0.1",
    "name": "Symbol-Digit Matching v1.0.1 (5-pair map, 40 trials)",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 40,
      "symbolDigitMap": [
        [
          "●",
          1
        ],
        [
          "■",
          2
        ],
        [
          "▲",
          3
        ],
        [
          "◆",
          4
        ],
        [
          "★",
          5
        ]
      ],
      "fixationMs": 400,
      "timeoutMs": 8000,
      "validRtFloorMs": 250,
      "report": {
        "reportVersion": "1.0.1",
        "referenceMode": "none"
      }
    }
  },
  {
    "testType": "symbolmatch",
    "configVersion": "1.0.1-report3",
    "name": "照图例找数字 / report 3.0.0",
    "status": "DRAFT",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "config": {
      "totalTrials": 40,
      "symbolDigitMap": [
        [
          "●",
          1
        ],
        [
          "■",
          2
        ],
        [
          "▲",
          3
        ],
        [
          "◆",
          4
        ],
        [
          "★",
          5
        ]
      ],
      "fixationMs": 400,
      "timeoutMs": 8000,
      "validRtFloorMs": 250,
      "report": {
        "reportVersion": "3.0.0",
        "referenceMode": "none"
      }
    }
  }
]
