import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.2.0",
    "testType": "sst",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "停止信号任务 SST",
    "metrics": {
      "ssrtMs": {
        "label": "停止反应估计用时",
        "explanation": "根据停止信号模型估计，须结合协议和质量限制阅读。",
        "singleExplanation": "停止反应估计时间：根据停止信号模型估计的动作停止时间。"
      },
      "pRespondStop": {
        "label": "停止信号后仍响应的比例",
        "explanation": "停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。",
        "singleExplanation": "停止信号后仍作出反应的比例，用于检查停止任务是否处于可解释范围。"
      },
      "goMedianRtMs": {
        "label": "回应信号的典型用时",
        "explanation": "Go 条件有效响应的中位用时。"
      },
      "goOmissionRate": {
        "label": "回应信号未响应比例",
        "explanation": "Go 条件应该回应但没有回应的比例。"
      },
      "goChoiceErrorRate": {
        "label": "回应信号选择错误比例",
        "explanation": "Go 条件出现错误方向选择的比例。"
      },
      "meanSsdMs": {
        "label": "平均 SSD"
      },
      "unsuccessfulStopRtMs": {
        "label": "失败 Stop 的 RT"
      }
    },
    "experienceHeadline": "pRespondStop",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "科研版以 SSRT 为主；体验/正式版不得输出过度确定的个人抑制结论。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果反映本次动作停止任务表现，不是临床诊断或常模。",
    "reportReading": {
      "version": "1.1.0",
      "title": "已经准备出手，也能按下暂停",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "根据这次作答，停止动作的估计用时是 {ssrtMs}。暂停提示后仍发生回应的比例是 {pRespondStop}。",
        "metricKeys": [
          "ssrtMs",
          "pRespondStop"
        ]
      },
      "studentMetricKeys": [
        "ssrtMs",
        "pRespondStop",
        "goMedianRtMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [],
      "metricGates": {
        "ssrtMs": [
          "legacyUninterpretable",
          "insufficientStopTrials",
          "pRespondStopOutOfRange",
          "highGoOmission",
          "strategicSlowingSuspected"
        ],
        "pRespondStop": []
      },
      "nextStep": "停止信号后的响应比例不是越低越好。先阅读协议限制，不作个人或临床抑制结论。",
      "hiddenByProfile": {
        "experience": [
          "ssrtMs"
        ]
      },
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "pRespondStop",
          "goOmissionRate",
          "goChoiceErrorRate"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，暂停提示后仍发生回应的比例是 {pRespondStop}。提示出现的早晚也会影响它。",
          "metricKeys": [
            "pRespondStop"
          ]
        }
      },
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "SSRT": "停止反应估计用时（SSRT）",
        "Stop": "停止信号条件",
        "Go": "回应信号条件",
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
      "illustration": "stop",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "“看到就回应”和“已经准备回应却临时停下”是不同的过程。停止信号任务让你先准备动作，再偶尔收到暂停提示；能否停下也与提示来得早晚有关。",
        "takeaway": "回应很重要，收住动作也一样。",
        "exampleTitle": "走出任务：生活与工作中的一个例子",
        "example": "按下消息发送键前发现收件人不对，或驾驶中看到需要避让的变化，都包含及时中止动作的环节。这个小任务不能判断自控力、性格或驾驶资格。",
        "scene": "stop",
        "frames": [
          {
            "title": "准备行动",
            "text": "按正常信号准备回应。"
          },
          {
            "title": "收到暂停",
            "text": "在少数试次里，动作需要中止。"
          },
          {
            "title": "看两类记录",
            "text": "回应与停止分开阅读。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "ssrtMs": {
            "label": "这次停止动作的估计用时",
            "explanation": "由一组回应与停止记录估计出来，不能直接当成现实中的刹车时间。"
          },
          "pRespondStop": {
            "label": "暂停提示后仍有回应",
            "explanation": "显示收到暂停提示后仍作出回应的比例；提示出现早晚会影响它。"
          },
          "goMedianRtMs": {
            "label": "正常回应的通常用时",
            "explanation": "只看没有暂停提示时，你正确回应所用的典型时间。"
          }
        }
      },
      "professional": {
        "construct": "停止信号范式中的动作取消过程",
        "procedure": "Go/Stop 序列及 SSD 阶梯由冻结种子重建。SSRT 使用积分法：Go RT 排序中按 pRespondStop 确定的分位用时减去平均 SSD；Go 遗漏用最大已观察 Go RT 替换。",
        "interpretation": "先核查 Stop 数量、pRespondStop 范围、Go 遗漏和策略性减速，再解释 SSRT。短程不展示 SSRT；过程概率只描述本次记录，不作越低越好的能力排名。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "任务理解、作答中断、阶段覆盖和试次数影响解释边界。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "ssrtMs": {
            "definition": "积分法估计：按停止响应概率确定的 Go RT 排序值减去平均 SSD。",
            "readingHint": "属于模型估计；先核查 Stop 数量、概率范围、Go 遗漏与策略性减速，短程不作个体估计解释。"
          },
          "pRespondStop": {
            "definition": "停止试次中仍有响应的次数除以停止试次数。",
            "readingHint": "是过程概率，受 SSD 阶梯调节；并非越低越好或个人抑制能力等级。"
          },
          "goMedianRtMs": {
            "definition": "Go 条件有效响应的中位用时。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "goOmissionRate": {
            "definition": "Go 条件应该回应但没有回应的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "goChoiceErrorRate": {
            "definition": "Go 条件出现错误方向选择的比例。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "meanSsdMs": {
            "definition": "按本次冻结任务定义记录“平均 SSD”。",
            "readingHint": "只在同一任务、相同条件及足够有效记录下作描述性比较；配合质量标记和协议限制阅读。"
          },
          "unsuccessfulStopRtMs": {
            "definition": "按本次冻结任务定义记录“失败 Stop 的 RT”。",
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
            "key": "stopRatio",
            "label": "停止试次比例"
          },
          {
            "key": "ssdStartMs",
            "label": "初始 SSD（毫秒）"
          },
          {
            "key": "ssdStepMs",
            "label": "SSD 阶梯步长（毫秒）"
          },
          {
            "key": "validRtFloorMs",
            "label": "有效 RT 下限（毫秒）"
          }
        ]
      }
    }
  }
]
