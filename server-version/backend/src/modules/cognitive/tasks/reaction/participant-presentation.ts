import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "reaction",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "简单反应时",
    "metrics": {
      "medianRtMs": {
        "label": "典型反应用时",
        "explanation": "中位数：有效反应用时按大小排列后的中间位置。",
        "singleExplanation": "中位数：有效反应用时按大小排列后的中间位置。"
      },
      "rtICV": {
        "label": "用时波动比例",
        "explanation": "标准差除以平均反应用时；用于描述波动，不是正确率。",
        "singleExplanation": "标准差除以平均反应用时；用于描述波动，不是正确率。"
      },
      "missRate": {
        "label": "遗漏率",
        "explanation": "遗漏比例：应该响应但没有在有效时间内响应的比例。",
        "singleExplanation": "遗漏比例：该作答但没有在有效时间内作答的比例。"
      },
      "meanRtMs": {
        "label": "平均反应用时",
        "explanation": "所有有效反应用时的算术平均值；未及时响应不计入。",
        "singleExplanation": "所有有效反应用时的算术平均值；未及时响应不计入。"
      },
      "sdRtMs": {
        "label": "用时波动（标准差）",
        "explanation": "有效反应用时的离散程度，与平均用时使用相同单位。",
        "singleExplanation": "有效反应用时的离散程度，与平均用时使用相同单位。"
      },
      "fastestRtMs": {
        "label": "最短有效用时",
        "explanation": "有效记录中最短的一次用时，不等同于典型速度。",
        "singleExplanation": "有效记录中最短的一次用时，不等同于典型速度。"
      },
      "prematureCount": {
        "label": "提前操作",
        "explanation": "早于信号的操作事件，可与有效试次重叠。",
        "displayUnit": "次"
      },
      "validTrialCount": {
        "label": "有效反应",
        "explanation": "本次落在有效用时范围内的响应次数。",
        "displayUnit": "次"
      },
      "missCount": {
        "label": "未及时响应",
        "displayUnit": "次",
        "explanation": "没有在有效用时范围内响应的试次数，不推断原因。",
        "singleExplanation": "没有在有效用时范围内响应的试次数，不推断原因。"
      },
      "totalTrials": {
        "label": "总试次数",
        "displayUnit": "次",
        "explanation": "本次正式任务全部试次，作为完成数量的分母。",
        "singleExplanation": "本次正式任务全部试次，作为完成数量的分母。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次任务表现，不是医学诊断或人口常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "从看见，到出手",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "在 {totalTrials} 尝试中，你留下了 {validTrialCount} 有效回应。通常一次回应用了 {medianRtMs}。",
        "metricKeys": [
          "totalTrials",
          "validTrialCount",
          "medianRtMs"
        ]
      },
      "studentMetricKeys": [
        "medianRtMs",
        "validTrialCount",
        "prematureCount"
      ],
      "processMetricKeys": [
        "validTrialCount",
        "totalTrials",
        "missCount",
        "prematureCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidTrials"
      ],
      "metricGates": {},
      "nextStep": "先等信号再回应；比较记录时尽量使用相同设备和操作方式。",
      "chart": {
        "kind": "reaction_trials",
        "metricKeys": [
          "medianRtMs"
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
      "illustration": "signal",
      "qualityLabels": {
        "insufficientValidTrials": "有效反应记录不足",
        "highMissRate": "未及时响应较多",
        "interrupted": "作答期间出现中断",
        "excessivePremature": "提前操作较多",
        "extremeRtPattern": "反应用时波动较大"
      },
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "从信号出现到你动手回应，中间有一小段时间，这就是反应时。1 毫秒是千分之一秒。我们看一组回应中间的那个用时，避免把最快的一次当成全部表现。",
        "takeaway": "快，是看清之后的回应。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "驾驶员看到路况变化、运动员接到发球，都需要及时回应。但真实场景还涉及判断、预判与动作控制；这里的按键记录不能预测驾驶安全或运动成绩。",
        "scene": "signal",
        "frames": [
          {
            "title": "信号出现",
            "text": "目标发生变化，观察从此刻开始。"
          },
          {
            "title": "看清再回应",
            "text": "先识别信号，再执行任务要求。"
          },
          {
            "title": "留下记录",
            "text": "记录本次用时，而不是给人贴标签。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "medianRtMs": {
            "label": "通常一次回应用了多久",
            "explanation": "把有效用时从短到长排好，取中间的那个；不会只挑最快的一次。"
          },
          "prematureCount": {
            "label": "信号前就动手",
            "explanation": "信号还没出现时发生的操作，可与其他记录重叠。"
          },
          "validTrialCount": {
            "label": "记录完整的回应",
            "explanation": "这些回应落在任务允许的时间范围里。"
          },
          "totalTrials": {
            "label": "本次尝试",
            "explanation": "这是本次正式尝试的总数量。"
          }
        }
      },
      "professional": {
        "construct": "简单视觉反应的响应潜伏期及试次内变异",
        "procedure": "以信号出现至响应的时间记录为基础；有效 RT 取 100ms 至冻结 timeoutMs 范围内的值。中断另作为质量事件，不直接用作原因诊断。",
        "interpretation": "结合有效反应数量、遗漏及提前反应解释中位 RT；不能把最短 RT 当典型速度。跨次比较需保持输入设备和情境一致。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "medianRtMs": {
            "definition": "有效反应时排序后的中位数。",
            "readingHint": "与有效记录量、遗漏和提前反应联合阅读；不是最快一次，也不是跨情境速度等级。"
          },
          "rtICV": {
            "definition": "有效反应时标准差除以平均反应时。",
            "readingHint": "无量纲的相对离散度；显示百分数不意味着正确率。"
          },
          "missRate": {
            "definition": "遗漏比例：应该响应但没有在有效时间内响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "meanRtMs": {
            "definition": "有效反应时的算术平均值；未及时响应不计为0。",
            "readingHint": "与中位数及标准差联合阅读，留意分布长尾与极端记录。"
          },
          "sdRtMs": {
            "definition": "有效反应时的标准差，单位为毫秒。",
            "readingHint": "绝对离散程度，应与平均用时、样本量和设备条件一起阅读。"
          },
          "fastestRtMs": {
            "definition": "有效记录中最短的一次用时，不等同于典型速度。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "prematureCount": {
            "definition": "早于信号的操作事件，可与有效试次重叠。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "validTrialCount": {
            "definition": "本次落在有效用时范围内的响应次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "missCount": {
            "definition": "没有在有效用时范围内响应的试次数，不推断原因。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "totalTrials": {
            "definition": "本次正式任务全部试次，作为完成数量的分母。",
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
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "reaction",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.1.0",
    "title": "简单反应时",
    "metrics": {
      "medianRtMs": {
        "label": "典型反应用时",
        "explanation": "中位数：有效反应用时按大小排列后的中间位置。",
        "singleExplanation": "中位数：有效反应用时按大小排列后的中间位置。"
      },
      "rtICV": {
        "label": "用时波动比例",
        "explanation": "标准差除以平均反应用时；用于描述波动，不是正确率。",
        "singleExplanation": "标准差除以平均反应用时；用于描述波动，不是正确率。"
      },
      "missRate": {
        "label": "遗漏率",
        "explanation": "遗漏比例：应该响应但没有在有效时间内响应的比例。",
        "singleExplanation": "遗漏比例：该作答但没有在有效时间内作答的比例。"
      },
      "meanRtMs": {
        "label": "平均反应用时",
        "explanation": "所有有效反应用时的算术平均值；未及时响应不计入。",
        "singleExplanation": "所有有效反应用时的算术平均值；未及时响应不计入。"
      },
      "sdRtMs": {
        "label": "用时波动（标准差）",
        "explanation": "有效反应用时的离散程度，与平均用时使用相同单位。",
        "singleExplanation": "有效反应用时的离散程度，与平均用时使用相同单位。"
      },
      "fastestRtMs": {
        "label": "最短有效用时",
        "explanation": "有效记录中最短的一次用时，不等同于典型速度。",
        "singleExplanation": "有效记录中最短的一次用时，不等同于典型速度。"
      },
      "prematureCount": {
        "label": "提前操作",
        "explanation": "早于信号的操作事件，可与有效试次重叠。",
        "displayUnit": "次"
      },
      "validTrialCount": {
        "label": "有效反应",
        "explanation": "本次落在有效用时范围内的响应次数。",
        "displayUnit": "次"
      },
      "missCount": {
        "label": "未及时响应",
        "displayUnit": "次",
        "explanation": "没有在有效用时范围内响应的试次数，不推断原因。",
        "singleExplanation": "没有在有效用时范围内响应的试次数，不推断原因。"
      },
      "totalTrials": {
        "label": "总试次数",
        "displayUnit": "次",
        "explanation": "本次正式任务全部试次，作为完成数量的分母。",
        "singleExplanation": "本次正式任务全部试次，作为完成数量的分母。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "在需要快速响应时先减少外部干扰。",
      "比较多次结果时尽量使用相近设备和作答方式。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次任务表现，不是医学诊断或人口常模。任务表现指数不是常模位置。",
    "reportReading": {
      "version": "1.1.0",
      "title": "从看见，到出手",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "在 {totalTrials} 尝试中，你留下了 {validTrialCount} 有效回应。通常一次回应用了 {medianRtMs}。",
        "metricKeys": [
          "totalTrials",
          "validTrialCount",
          "medianRtMs"
        ]
      },
      "studentMetricKeys": [
        "medianRtMs",
        "validTrialCount",
        "prematureCount"
      ],
      "processMetricKeys": [
        "validTrialCount",
        "totalTrials",
        "missCount",
        "prematureCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidTrials"
      ],
      "metricGates": {},
      "nextStep": "先等信号再回应；比较记录时尽量使用相同设备和操作方式。",
      "chart": {
        "kind": "reaction_trials",
        "metricKeys": [
          "medianRtMs"
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
      "illustration": "signal",
      "qualityLabels": {
        "insufficientValidTrials": "有效反应记录不足",
        "highMissRate": "未及时响应较多",
        "interrupted": "作答期间出现中断",
        "excessivePremature": "提前操作较多",
        "extremeRtPattern": "反应用时波动较大"
      },
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "从信号出现到你动手回应，中间有一小段时间，这就是反应时。1 毫秒是千分之一秒。我们看一组回应中间的那个用时，避免把最快的一次当成全部表现。",
        "takeaway": "快，是看清之后的回应。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "驾驶员看到路况变化、运动员接到发球，都需要及时回应。但真实场景还涉及判断、预判与动作控制；这里的按键记录不能预测驾驶安全或运动成绩。",
        "scene": "signal",
        "frames": [
          {
            "title": "信号出现",
            "text": "目标发生变化，观察从此刻开始。"
          },
          {
            "title": "看清再回应",
            "text": "先识别信号，再执行任务要求。"
          },
          {
            "title": "留下记录",
            "text": "记录本次用时，而不是给人贴标签。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "medianRtMs": {
            "label": "通常一次回应用了多久",
            "explanation": "把有效用时从短到长排好，取中间的那个；不会只挑最快的一次。"
          },
          "prematureCount": {
            "label": "信号前就动手",
            "explanation": "信号还没出现时发生的操作，可与其他记录重叠。"
          },
          "validTrialCount": {
            "label": "记录完整的回应",
            "explanation": "这些回应落在任务允许的时间范围里。"
          },
          "totalTrials": {
            "label": "本次尝试",
            "explanation": "这是本次正式尝试的总数量。"
          }
        }
      },
      "professional": {
        "construct": "简单视觉反应的响应潜伏期及试次内变异",
        "procedure": "以信号出现至响应的时间记录为基础；有效 RT 取 100ms 至冻结 timeoutMs 范围内的值。中断另作为质量事件，不直接用作原因诊断。",
        "interpretation": "结合有效反应数量、遗漏及提前反应解释中位 RT；不能把最短 RT 当典型速度。跨次比较需保持输入设备和情境一致。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "medianRtMs": {
            "definition": "有效反应时排序后的中位数。",
            "readingHint": "与有效记录量、遗漏和提前反应联合阅读；不是最快一次，也不是跨情境速度等级。"
          },
          "rtICV": {
            "definition": "有效反应时标准差除以平均反应时。",
            "readingHint": "无量纲的相对离散度；显示百分数不意味着正确率。"
          },
          "missRate": {
            "definition": "遗漏比例：应该响应但没有在有效时间内响应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "meanRtMs": {
            "definition": "有效反应时的算术平均值；未及时响应不计为0。",
            "readingHint": "与中位数及标准差联合阅读，留意分布长尾与极端记录。"
          },
          "sdRtMs": {
            "definition": "有效反应时的标准差，单位为毫秒。",
            "readingHint": "绝对离散程度，应与平均用时、样本量和设备条件一起阅读。"
          },
          "fastestRtMs": {
            "definition": "有效记录中最短的一次用时，不等同于典型速度。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "prematureCount": {
            "definition": "早于信号的操作事件，可与有效试次重叠。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "validTrialCount": {
            "definition": "本次落在有效用时范围内的响应次数。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "missCount": {
            "definition": "没有在有效用时范围内响应的试次数，不推断原因。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "totalTrials": {
            "definition": "本次正式任务全部试次，作为完成数量的分母。",
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
          }
        ]
      }
    }
  }
]
