import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "taskswitch",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "任务转换 Task Switching",
    "metrics": {
      "switchCostRtMs": {
        "label": "RT 转换代价",
        "explanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。",
        "singleExplanation": "规则转换额外耗时：切换规则试次相对重复规则试次增加的反应时间。"
      },
      "switchCostAccuracy": {
        "label": "准确率转换代价",
        "explanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。",
        "singleExplanation": "准确率转换代价：切换规则时相对重复规则时的正确率变化。"
      },
      "medianRtSwitch": {
        "label": "Switch 中位RT"
      },
      "medianRtRepeat": {
        "label": "Repeat 中位RT"
      },
      "accuracySwitch": {
        "label": "Switch 准确率"
      },
      "accuracyRepeat": {
        "label": "Repeat 准确率"
      },
      "mixingCost": {
        "label": "混合区块相对单任务代价"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "转换代价必须与 switch/repeat 准确率同屏阅读，避免只看速度。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次认知灵活性任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "换一条规则，思路也要转弯",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这次，换规则与沿用规则时的通常用时相差 {switchCostRtMs}，正确比例相差 {switchCostAccuracy}。",
        "metricKeys": [
          "switchCostRtMs",
          "switchCostAccuracy"
        ]
      },
      "studentMetricKeys": [
        "switchCostRtMs",
        "accuracySwitch",
        "accuracyRepeat"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientSwitchTrials",
        "insufficientRepeatTrials"
      ],
      "metricGates": {},
      "nextStep": "用时差与正确率一起看，不把一次切换成本解释为灵活性能力等级。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "accuracySwitch",
          "accuracyRepeat"
        ]
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "人口常模": "经过验证的同龄人比较依据",
        "常模等级": "经过验证的同龄人等级",
        "年龄等级": "年龄对应的能力等级",
        "稳定能力等级": "固定的能力水平",
        "内部配置": "这次任务设置",
        "正式档": "标准任务",
        "体验档": "简短体验",
        "标准协议": "标准任务",
        "短程协议": "简短体验"
      },
      "illustration": "rules",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "刚才按一种规则判断，接下来又要换另一种规则。切换时多用的时间或出错变化，描述的是这一次“换挡”的过程。",
        "takeaway": "换规则的那一刻，值得单独看。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "编辑在核对字词和版式之间切换、实验人员在两种判定标准之间切换，都需要重新对齐目标。任务切换差值不是多任务工作能力的完整评估。",
        "scene": "rules",
        "frames": [
          {
            "title": "确认目标",
            "text": "先弄清当前要观察什么。"
          },
          {
            "title": "按规则判断",
            "text": "比较线索，选择合适的响应。"
          },
          {
            "title": "回看过程",
            "text": "用实际记录理解本次表现。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "switchCostRtMs": {
            "label": "换规则时，用时差了多少",
            "explanation": "换规则和沿用规则时的典型用时差；快慢要连同正确率看。"
          },
          "switchCostAccuracy": {
            "label": "换规则时，正确比例的变化",
            "explanation": "沿用规则的正确比例减去换规则的正确比例。"
          },
          "accuracySwitch": {
            "label": "换规则后判断正确多少",
            "explanation": "只看需要换一条规则的那些尝试。"
          },
          "accuracyRepeat": {
            "label": "沿用规则时判断正确多少",
            "explanation": "只看继续使用同一条规则的那些尝试。"
          }
        }
      },
      "professional": {
        "construct": "线索化任务转换与混合区组成本",
        "procedure": "分别统计切换/重复试次正确率及正确反应中位 RT；RT 转换代价为切换减重复，准确率代价为重复减切换。",
        "interpretation": "结合条件覆盖和准确率阅读转换差值；仅在协议包含纯区组时解释 mixingCost。差值不宜直接合成为执行功能总分。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "switchCostRtMs": {
            "definition": "切换条件的正确反应中位 RT 减去重复条件的正确反应中位 RT。",
            "readingHint": "同时审阅条件准确率与试次覆盖；负差值保留，不转化为能力等级。"
          },
          "switchCostAccuracy": {
            "definition": "重复条件正确率减去切换条件正确率。",
            "readingHint": "是条件比例差值，不能忽略分母及速度—准确率权衡。"
          },
          "medianRtSwitch": {
            "definition": "按本次冻结任务定义记录“Switch 中位RT”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "medianRtRepeat": {
            "definition": "按本次冻结任务定义记录“Repeat 中位RT”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracySwitch": {
            "definition": "按本次冻结任务定义记录“Switch 准确率”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "accuracyRepeat": {
            "definition": "按本次冻结任务定义记录“Repeat 准确率”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "mixingCost": {
            "definition": "按本次冻结任务定义记录“混合区块相对单任务代价”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          },
          {
            "key": "blockCount",
            "label": "区组数"
          },
          {
            "key": "includePureBlocks",
            "label": "是否含纯区组"
          }
        ]
      }
    }
  }
]
