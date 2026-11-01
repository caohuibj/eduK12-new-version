import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "maze",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.1",
    "title": "迷宫学习",
    "metrics": {
      "pathEfficiency": {
        "label": "路径效率",
        "explanation": "路径效率：最优路径长度与实际走的长度的比值，1.0 表示走了最短路线。",
        "singleExplanation": "路径效率：最优路径与实际路径的比值，越接近 1 越好。"
      },
      "completedCount": {
        "label": "完成迷宫数",
        "explanation": "完成迷宫数：成功从起点走到终点的迷宫数量。",
        "singleExplanation": "完成迷宫数：成功到达终点的迷宫数量。"
      },
      "totalDeadEnds": {
        "label": "重复进入已到过位置的次数",
        "explanation": "重复进入已到过位置的次数：进入已经到过的格子的累计次数；不等同于遇到死路的次数。",
        "singleExplanation": "重复进入已到过位置的次数：进入已经到过的格子的累计次数。"
      },
      "medianCompletionTimeMs": {
        "label": "平均完成用时"
      }
    },
    "experienceHeadline": "pathEfficiency",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先记住整体方向（目标是右下角），再选择具体路线。",
      "进入死路时尽快回头，不要反复尝试同一方向。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次迷宫导航表现，不是空间能力诊断或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "这次迷宫，你走了怎样的路线？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的路径效率是 {pathEfficiency}；共完成了 {completedCount} 个迷宫。",
        "metricKeys": [
          "pathEfficiency",
          "completedCount"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的路径效率是 {pathEfficiency}；体验版仅 2 个迷宫。",
          "metricKeys": [
            "pathEfficiency"
          ]
        }
      },
      "studentMetricKeys": [
        "pathEfficiency",
        "totalDeadEnds"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "incompleteMazes"
      ],
      "metricGates": {},
      "nextStep": "先看本次完成了几个迷宫，再结合路径效率和用时阅读。回到走过的格子可能是探索路线的一部分，不能据此判断规划能力不足。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "pathEfficiency"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
        "年龄常模": "经过验证的同龄人比较依据",
        "常模等级": "经过验证的同龄人等级",
        "年龄等级": "年龄对应的能力等级",
        "稳定能力等级": "固定的能力水平",
        "内部配置": "这次任务设置",
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "一个迷宫，从左上角出发，目标是右下角。你用方向键一步步走——但墙会挡住你。这个任务记录本次在特定迷宫中探索、选择和执行路线的表现。",
        "takeaway": "先看大局定方向，再一步一步走。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "在陌生城市找路、在商场找到目标店铺、规划从家到学校的路线，都需要空间导航。它只是空间能力的一小部分，不代表你的方向感或智力全貌。",
        "scene": "sequence",
        "frames": [
          {
            "title": "看全局",
            "text": "目标在右下角，先确定大方向。"
          },
          {
            "title": "逐步走",
            "text": "用方向键一格一格移动。"
          },
          {
            "title": "到终点",
            "text": "走出最短路线到达终点。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "pathEfficiency": {
            "label": "路线与最短路径的比较",
            "explanation": "最优路径与实际路径的比值；1.0 = 最短路线。"
          },
          "totalDeadEnds": {
            "label": "重复进入已到过的格子",
            "explanation": "进入已访问过格子的次数。"
          },
          "completedCount": {
            "label": "完成了几个",
            "explanation": "成功到达终点的迷宫数量。"
          }
        }
      },
      "professional": {
        "construct": "空间导航与路线规划",
        "procedure": "迷宫由递归回溯算法从 seed+mazeIndex 生成（完美迷宫，唯一解）；参与者从左上角导航至右下角；服务端重建迷宫、逐步验证移动合法性并计算最优路径（BFS）；路径效率 = 最优路径长度 / 实际移动步数。",
        "interpretation": "路径效率 1.0 表示走了最短路线；效率受策略（右手法则 vs 目标导向）影响。移动合法性由服务端逐步验证，穿墙提交直接拒绝。",
        "confounders": [
          "屏幕尺寸影响迷宫显示和导航体验。",
          "策略差异（右手法则 vs 目标导向）影响路径效率。",
          "本报告不提供经过验证的人口常模、诊断、空间能力或智力等级结论。"
        ],
        "metricNotes": {
          "pathEfficiency": {
            "definition": "已完成迷宫的最优路径长度之和 / 实际移动步数之和；未全部完成时为 null。",
            "readingHint": "1.0 = 全走最短路线；越低说明绕路越多。"
          },
          "completedCount": {
            "definition": "成功到达终点的迷宫数。",
            "readingHint": "与总迷宫数对照阅读。"
          },
          "totalDeadEnds": {
            "definition": "累计进入已访问格子的次数。",
            "readingHint": "描述这次路线中的重访，不据此推断稳定规划能力。"
          },
          "medianCompletionTimeMs": {
            "definition": "已完成迷宫的平均完成用时。",
            "readingHint": "与路径效率同读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划迷宫数"
          },
          {
            "key": "mazeCols",
            "label": "迷宫列数"
          },
          {
            "key": "timeLimitMs",
            "label": "时间限制（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "maze",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.1",
    "title": "看图走迷宫（独立练习）",
    "metrics": {
      "pathEfficiency": {
        "label": "路径效率",
        "explanation": "路径效率：最优路径长度与实际走的长度的比值，1.0 表示走了最短路线。",
        "singleExplanation": "路径效率：最优路径与实际路径的比值，越接近 1 越好。"
      },
      "completedCount": {
        "label": "完成迷宫数",
        "explanation": "完成迷宫数：成功从起点走到终点的迷宫数量。",
        "singleExplanation": "完成迷宫数：成功到达终点的迷宫数量。"
      },
      "totalDeadEnds": {
        "label": "重复进入已到过位置的次数",
        "explanation": "重复进入已到过位置的次数：进入已经到过的格子的累计次数；不等同于遇到死路的次数。",
        "singleExplanation": "重复进入已到过位置的次数：进入已经到过的格子的累计次数。"
      },
      "medianCompletionTimeMs": {
        "label": "平均完成用时"
      }
    },
    "experienceHeadline": "pathEfficiency",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先记住整体方向（目标是右下角），再选择具体路线。",
      "进入死路时尽快回头，不要反复尝试同一方向。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次迷宫导航表现，不是空间能力诊断或年龄常模判断。",
    "reportReading": {
      "version": "1.1.0",
      "title": "这次迷宫，你走了怎样的路线？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你的路径效率是 {pathEfficiency}；共完成了 {completedCount} 个迷宫。",
        "metricKeys": [
          "pathEfficiency",
          "completedCount"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的路径效率是 {pathEfficiency}；体验版仅 2 个迷宫。",
          "metricKeys": [
            "pathEfficiency"
          ]
        }
      },
      "studentMetricKeys": [
        "pathEfficiency",
        "totalDeadEnds"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "incompleteMazes"
      ],
      "metricGates": {},
      "nextStep": "先看本次完成了几个迷宫，再结合路径效率和用时阅读。回到走过的格子可能是探索路线的一部分，不能据此判断规划能力不足。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "pathEfficiency"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
        "年龄常模": "经过验证的同龄人比较依据",
        "常模等级": "经过验证的同龄人等级",
        "年龄等级": "年龄对应的能力等级",
        "稳定能力等级": "固定的能力水平",
        "内部配置": "这次任务设置",
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "一个迷宫，从左上角出发，目标是右下角。你用方向键一步步走——但墙会挡住你。这个任务记录本次在特定迷宫中探索、选择和执行路线的表现。",
        "takeaway": "先看大局定方向，再一步一步走。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "在陌生城市找路、在商场找到目标店铺、规划从家到学校的路线，都需要空间导航。它只是空间能力的一小部分，不代表你的方向感或智力全貌。",
        "scene": "sequence",
        "frames": [
          {
            "title": "看全局",
            "text": "目标在右下角，先确定大方向。"
          },
          {
            "title": "逐步走",
            "text": "用方向键一格一格移动。"
          },
          {
            "title": "到终点",
            "text": "走出最短路线到达终点。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。 先用独立3×3图练习操作；正式图另行生成，不是重复同图的学习测量。",
        "metricHelp": {
          "pathEfficiency": {
            "label": "路线与最短路径的比较",
            "explanation": "最优路径与实际路径的比值；1.0 = 最短路线。"
          },
          "totalDeadEnds": {
            "label": "重复进入已到过的格子",
            "explanation": "进入已访问过格子的次数。"
          },
          "completedCount": {
            "label": "完成了几个",
            "explanation": "成功到达终点的迷宫数量。"
          }
        }
      },
      "professional": {
        "construct": "空间导航与路线规划",
        "procedure": "迷宫由递归回溯算法从 seed+mazeIndex 生成（完美迷宫，唯一解）；参与者从左上角导航至右下角；服务端重建迷宫、逐步验证移动合法性并计算最优路径（BFS）；路径效率 = 最优路径长度 / 实际移动步数。 本版先用单独种子生成3×3练习，正式尺寸至少5×5，默认7×7；练习不会作为任何正式图。正式种子序列和评分保持原规则。",
        "interpretation": "路径效率 1.0 表示走了最短路线；效率受策略（右手法则 vs 目标导向）影响。移动合法性由服务端逐步验证，穿墙提交直接拒绝。",
        "confounders": [
          "屏幕尺寸影响迷宫显示和导航体验。",
          "策略差异（右手法则 vs 目标导向）影响路径效率。",
          "本报告不提供经过验证的人口常模、诊断、空间能力或智力等级结论。"
        ],
        "metricNotes": {
          "pathEfficiency": {
            "definition": "已完成迷宫的最优路径长度之和 / 实际移动步数之和；未全部完成时为 null。",
            "readingHint": "1.0 = 全走最短路线；越低说明绕路越多。"
          },
          "completedCount": {
            "definition": "成功到达终点的迷宫数。",
            "readingHint": "与总迷宫数对照阅读。"
          },
          "totalDeadEnds": {
            "definition": "累计进入已访问格子的次数。",
            "readingHint": "描述这次路线中的重访，不据此推断稳定规划能力。"
          },
          "medianCompletionTimeMs": {
            "definition": "已完成迷宫的平均完成用时。",
            "readingHint": "与路径效率同读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划迷宫数"
          },
          {
            "key": "mazeCols",
            "label": "迷宫列数"
          },
          {
            "key": "timeLimitMs",
            "label": "时间限制（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "maze",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.0.1",
    "title": "看图走迷宫",
    "metrics": {
      "pathEfficiency": {
        "label": "已完成路线的步数效率",
        "explanation": "已完成迷宫最短路线步数合计/实际步数合计；未完成迷宫不进入该比例。",
        "singleExplanation": "已完成迷宫最短路线步数合计/实际步数合计；未完成迷宫不进入该比例。"
      },
      "completedCount": {
        "label": "完成迷宫数",
        "explanation": "完成迷宫数：成功从起点走到终点的迷宫数量。",
        "singleExplanation": "完成迷宫数：成功到达终点的迷宫数量。"
      },
      "totalDeadEnds": {
        "label": "重复经过格子次数",
        "explanation": "沿合法移动轨迹重复访问已到过格子即累计；并非不同死胡同的数量。",
        "singleExplanation": "沿合法移动轨迹重复访问已到过格子即累计；并非不同死胡同的数量。"
      },
      "medianCompletionTimeMs": {
        "label": "完成用时平均值",
        "explanation": "历史键名含median，但当前公式是已完成迷宫总用时/完成数；本报告据实标为平均值。",
        "singleExplanation": "历史键名含median，但当前公式是已完成迷宫总用时/完成数；本报告据实标为平均值。"
      }
    },
    "experienceHeadline": "completedCount",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "简短体验",
        "participantConclusion": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
        "reportCaveats": [
          "本次正式任务共2张7×7迷宫。另有练习，当前与首张正式迷宫相同。",
          "体验常规约2–5分钟；研究约5–12分钟；取决于路线与思考时间（流程估计，非实测）。",
          "体验仅两张，先用独立3×3图练习，正式图另行生成。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
          "本版是随机完美网格迷宫、全图可见、离散移动。2015年 Looking Ahead? 研究用落杆迷宫、水平操纵及陷阱/逆行结构；本版也不同于隐藏平台的水迷宫。这里只借助文献说明范式差异，不把它当本版效度依据。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "常规任务",
        "participantConclusion": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
        "reportCaveats": [
          "本次正式任务共4张7×7迷宫。另有练习，当前与首张正式迷宫相同。",
          "体验常规约2–5分钟；研究约5–12分钟；取决于路线与思考时间（流程估计，非实测）。",
          "体验仅两张，先用独立3×3图练习，正式图另行生成。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
          "本版是随机完美网格迷宫、全图可见、离散移动。2015年 Looking Ahead? 研究用落杆迷宫、水平操纵及陷阱/逆行结构；本版也不同于隐藏平台的水迷宫。这里只借助文献说明范式差异，不把它当本版效度依据。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
        "reportCaveats": [
          "本次正式任务共8张7×7迷宫。另有练习，当前与首张正式迷宫相同。",
          "体验常规约2–5分钟；研究约5–12分钟；取决于路线与思考时间（流程估计，非实测）。",
          "体验仅两张，先用独立3×3图练习，正式图另行生成。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
          "本版是随机完美网格迷宫、全图可见、离散移动。2015年 Looking Ahead? 研究用落杆迷宫、水平操纵及陷阱/逆行结构；本版也不同于隐藏平台的水迷宫。这里只借助文献说明范式差异，不把它当本版效度依据。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "可以先在图上找关键岔路，再移动；重复经过格子时，看看自己是否在同一处来回。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "体验仅两张，先用独立3×3图练习，正式图另行生成。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
    "reportReading": {
      "version": "3.0.0",
      "title": "先看清路线，再一步步到出口",
      "introduction": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
      "summary": {
        "template": "完成 {completedCount} 张；已完成迷宫的最短路线步数占实际步数 {pathEfficiency}，重复经过格子累计 {totalDeadEnds} 次。",
        "metricKeys": [
          "completedCount",
          "pathEfficiency",
          "totalDeadEnds"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "完成 {completedCount} 张；已完成迷宫的最短路线步数占实际步数 {pathEfficiency}，重复经过格子累计 {totalDeadEnds} 次。",
          "metricKeys": [
            "completedCount",
            "pathEfficiency",
            "totalDeadEnds"
          ]
        }
      },
      "studentMetricKeys": [
        "completedCount",
        "pathEfficiency",
        "totalDeadEnds"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "incompleteMazes"
      ],
      "metricGates": {},
      "nextStep": "可以先在图上找关键岔路，再移动；重复经过格子时，看看自己是否在同一处来回。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "pathEfficiency"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
        "年龄常模": "经过验证的同龄人比较依据",
        "常模等级": "经过验证的同龄人等级",
        "年龄等级": "年龄对应的能力等级",
        "稳定能力等级": "固定的能力水平",
        "内部配置": "这次任务设置",
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
        "takeaway": "先看本次记录，再结合题量、缺失和任务条件理解。",
        "exampleTitle": "生活里也会遇到",
        "example": "像看平面图找一条少绕路的路线：先想好下一个转弯，有时比不停试方向更有帮助。这里每按一次只移动一格。",
        "scene": "sequence",
        "frames": [
          {
            "title": "任务怎样进行",
            "text": "2 / 4 / 8张7×7可见迷宫，每张最多120秒；另有练习，使用独立3×3图。"
          },
          {
            "title": "大概需要多久",
            "text": "体验常规约2–5分钟；研究约5–12分钟；取决于路线与思考时间。这是按流程估计，尚无本轮实测分布。"
          },
          {
            "title": "怎样读这次记录",
            "text": "可以先在图上找关键岔路，再移动；重复经过格子时，看看自己是否在同一处来回。"
          }
        ],
        "boundary": "体验仅两张，先用独立3×3图练习，正式图另行生成。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
        "metricHelp": {
          "completedCount": {
            "label": "完成迷宫数",
            "explanation": "完成迷宫数：成功从起点走到终点的迷宫数量。"
          },
          "pathEfficiency": {
            "label": "已完成路线的步数效率",
            "explanation": "已完成迷宫最短路线步数合计/实际步数合计；未完成迷宫不进入该比例。"
          },
          "totalDeadEnds": {
            "label": "重复经过格子次数",
            "explanation": "沿合法移动轨迹重复访问已到过格子即累计；并非不同死胡同的数量。"
          }
        }
      },
      "professional": {
        "construct": "本项目任务条件下的表现描述；没有同龄常模或本轮实测可靠性。",
        "procedure": "2 / 4 / 8张7×7可见迷宫，每张最多120秒；另有练习，使用独立3×3图。 本版是随机完美网格迷宫、全图可见、离散移动。2015年 Looking Ahead? 研究用落杆迷宫、水平操纵及陷阱/逆行结构；本版也不同于隐藏平台的水迷宫。这里只借助文献说明范式差异，不把它当本版效度依据。",
        "interpretation": "体验仅两张，先用独立3×3图练习，正式图另行生成。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
        "confounders": [
          "屏幕尺寸影响迷宫显示和导航体验。",
          "策略差异（右手法则 vs 目标导向）影响路径效率。",
          "本报告不提供经过验证的人口常模、诊断、空间能力或智力等级结论。",
          "设备与输入方式",
          "练习、熟悉和这次有效观察量"
        ],
        "metricNotes": {
          "pathEfficiency": {
            "definition": "已完成迷宫最短路线步数合计/实际步数合计；未完成迷宫不进入该比例。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "completedCount": {
            "definition": "成功到达终点的迷宫数。",
            "readingHint": "与总迷宫数对照阅读。"
          },
          "totalDeadEnds": {
            "definition": "沿合法移动轨迹重复访问已到过格子即累计；并非不同死胡同的数量。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "medianCompletionTimeMs": {
            "definition": "历史键名含median，但当前公式是已完成迷宫总用时/完成数；本报告据实标为平均值。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划迷宫数"
          },
          {
            "key": "mazeCols",
            "label": "迷宫列数"
          },
          {
            "key": "timeLimitMs",
            "label": "时间限制（毫秒）"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": []
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "maze",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.1",
    "title": "看图走迷宫",
    "metrics": {
      "pathEfficiency": {
        "label": "已完成路线的步数效率",
        "explanation": "已完成迷宫最短路线步数合计/实际步数合计；未完成迷宫不进入该比例。",
        "singleExplanation": "已完成迷宫最短路线步数合计/实际步数合计；未完成迷宫不进入该比例。"
      },
      "completedCount": {
        "label": "完成迷宫数",
        "explanation": "完成迷宫数：成功从起点走到终点的迷宫数量。",
        "singleExplanation": "完成迷宫数：成功到达终点的迷宫数量。"
      },
      "totalDeadEnds": {
        "label": "重复经过格子次数",
        "explanation": "沿合法移动轨迹重复访问已到过格子即累计；并非不同死胡同的数量。",
        "singleExplanation": "沿合法移动轨迹重复访问已到过格子即累计；并非不同死胡同的数量。"
      },
      "medianCompletionTimeMs": {
        "label": "完成用时平均值",
        "explanation": "历史键名含median，但当前公式是已完成迷宫总用时/完成数；本报告据实标为平均值。",
        "singleExplanation": "历史键名含median，但当前公式是已完成迷宫总用时/完成数；本报告据实标为平均值。"
      }
    },
    "experienceHeadline": "completedCount",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "简短体验",
        "participantConclusion": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
        "reportCaveats": [
          "本次正式任务共2张7×7迷宫。另有练习，当前与首张正式迷宫相同。",
          "体验常规约2–5分钟；研究约5–12分钟；取决于路线与思考时间（流程估计，非实测）。",
          "体验仅两张，且当前练习与第一张正式迷宫相同，会有熟悉效应。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
          "本版是随机完美网格迷宫、全图可见、离散移动。2015年 Looking Ahead? 研究用落杆迷宫、水平操纵及陷阱/逆行结构；本版也不同于隐藏平台的水迷宫。这里只借助文献说明范式差异，不把它当本版效度依据。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "常规任务",
        "participantConclusion": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
        "reportCaveats": [
          "本次正式任务共4张7×7迷宫。另有练习，当前与首张正式迷宫相同。",
          "体验常规约2–5分钟；研究约5–12分钟；取决于路线与思考时间（流程估计，非实测）。",
          "体验仅两张，且当前练习与第一张正式迷宫相同，会有熟悉效应。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
          "本版是随机完美网格迷宫、全图可见、离散移动。2015年 Looking Ahead? 研究用落杆迷宫、水平操纵及陷阱/逆行结构；本版也不同于隐藏平台的水迷宫。这里只借助文献说明范式差异，不把它当本版效度依据。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究变式",
        "participantConclusion": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
        "reportCaveats": [
          "本次正式任务共8张7×7迷宫。另有练习，当前与首张正式迷宫相同。",
          "体验常规约2–5分钟；研究约5–12分钟；取决于路线与思考时间（流程估计，非实测）。",
          "体验仅两张，且当前练习与第一张正式迷宫相同，会有熟悉效应。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
          "本版是随机完美网格迷宫、全图可见、离散移动。2015年 Looking Ahead? 研究用落杆迷宫、水平操纵及陷阱/逆行结构；本版也不同于隐藏平台的水迷宫。这里只借助文献说明范式差异，不把它当本版效度依据。",
          "尚无本轮实测可靠性；研究模式名称不代表标准复刻或已验证效度。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "可以先在图上找关键岔路，再移动；重复经过格子时，看看自己是否在同一处来回。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "体验仅两张，且当前练习与第一张正式迷宫相同，会有熟悉效应。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
    "reportReading": {
      "version": "3.0.0",
      "title": "先看清路线，再一步步到出口",
      "introduction": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
      "summary": {
        "template": "完成 {completedCount} 张；已完成迷宫的最短路线步数占实际步数 {pathEfficiency}，重复经过格子累计 {totalDeadEnds} 次。",
        "metricKeys": [
          "completedCount",
          "pathEfficiency",
          "totalDeadEnds"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "完成 {completedCount} 张；已完成迷宫的最短路线步数占实际步数 {pathEfficiency}，重复经过格子累计 {totalDeadEnds} 次。",
          "metricKeys": [
            "completedCount",
            "pathEfficiency",
            "totalDeadEnds"
          ]
        }
      },
      "studentMetricKeys": [
        "completedCount",
        "pathEfficiency",
        "totalDeadEnds"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "incompleteMazes"
      ],
      "metricGates": {},
      "nextStep": "可以先在图上找关键岔路，再移动；重复经过格子时，看看自己是否在同一处来回。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "pathEfficiency"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
        "年龄常模": "经过验证的同龄人比较依据",
        "常模等级": "经过验证的同龄人等级",
        "年龄等级": "年龄对应的能力等级",
        "稳定能力等级": "固定的能力水平",
        "内部配置": "这次任务设置",
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "sequence",
      "popular": {
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "完整迷宫一直可见，用方向键或屏幕按钮移动。报告记录走到出口的数量、完成路线用了多少步，以及重复经过格子的次数。",
        "takeaway": "先看本次记录，再结合题量、缺失和任务条件理解。",
        "exampleTitle": "生活里也会遇到",
        "example": "像看平面图找一条少绕路的路线：先想好下一个转弯，有时比不停试方向更有帮助。这里每按一次只移动一格。",
        "scene": "sequence",
        "frames": [
          {
            "title": "任务怎样进行",
            "text": "2 / 4 / 8张7×7可见迷宫，每张最多120秒；另有练习，当前重复首张正式图。"
          },
          {
            "title": "大概需要多久",
            "text": "体验常规约2–5分钟；研究约5–12分钟；取决于路线与思考时间。这是按流程估计，尚无本轮实测分布。"
          },
          {
            "title": "怎样读这次记录",
            "text": "可以先在图上找关键岔路，再移动；重复经过格子时，看看自己是否在同一处来回。"
          }
        ],
        "boundary": "体验仅两张，且当前练习与第一张正式迷宫相同，会有熟悉效应。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
        "metricHelp": {
          "completedCount": {
            "label": "完成迷宫数",
            "explanation": "完成迷宫数：成功从起点走到终点的迷宫数量。"
          },
          "pathEfficiency": {
            "label": "已完成路线的步数效率",
            "explanation": "已完成迷宫最短路线步数合计/实际步数合计；未完成迷宫不进入该比例。"
          },
          "totalDeadEnds": {
            "label": "重复经过格子次数",
            "explanation": "沿合法移动轨迹重复访问已到过格子即累计；并非不同死胡同的数量。"
          }
        }
      },
      "professional": {
        "construct": "本项目任务条件下的表现描述；没有同龄常模或本轮实测可靠性。",
        "procedure": "2 / 4 / 8张7×7可见迷宫，每张最多120秒；另有练习，当前重复首张正式图。 本版是随机完美网格迷宫、全图可见、离散移动。2015年 Looking Ahead? 研究用落杆迷宫、水平操纵及陷阱/逆行结构；本版也不同于隐藏平台的水迷宫。这里只借助文献说明范式差异，不把它当本版效度依据。",
        "interpretation": "体验仅两张，且当前练习与第一张正式迷宫相同，会有熟悉效应。不同轮换新图，不构成同一迷宫的学习曲线，也不是空间记忆或智力测验。",
        "confounders": [
          "屏幕尺寸影响迷宫显示和导航体验。",
          "策略差异（右手法则 vs 目标导向）影响路径效率。",
          "本报告不提供经过验证的人口常模、诊断、空间能力或智力等级结论。",
          "设备与输入方式",
          "练习、熟悉和这次有效观察量"
        ],
        "metricNotes": {
          "pathEfficiency": {
            "definition": "已完成迷宫最短路线步数合计/实际步数合计；未完成迷宫不进入该比例。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "completedCount": {
            "definition": "成功到达终点的迷宫数。",
            "readingHint": "与总迷宫数对照阅读。"
          },
          "totalDeadEnds": {
            "definition": "沿合法移动轨迹重复访问已到过格子即累计；并非不同死胡同的数量。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          },
          "medianCompletionTimeMs": {
            "definition": "历史键名含median，但当前公式是已完成迷宫总用时/完成数；本报告据实标为平均值。",
            "readingHint": "保留原计分；只按此分母与任务条件解释。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划迷宫数"
          },
          {
            "key": "mazeCols",
            "label": "迷宫列数"
          },
          {
            "key": "timeLimitMs",
            "label": "时间限制（毫秒）"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": []
      }
    }
  }
]
