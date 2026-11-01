import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "auditorynback",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "听觉 n-back 工作记忆",
    "metrics": {
      "dPrime": {
        "label": "d′",
        "explanation": "d′：由命中率与误报率共同计算的区分指标，描述本次区分匹配与非匹配音的情况；不是容量、智力或能力等级。",
        "singleExplanation": "d′：你分辨匹配音的敏锐程度。"
      },
      "hitRate": {
        "label": "命中率",
        "explanation": "命中率：出现匹配音时你按键的比例。"
      },
      "falseAlarmRate": {
        "label": "误报率",
        "explanation": "误报率：不是匹配音时你按了键的比例。"
      },
      "medianHitRtMs": {
        "label": "命中中位反应时"
      },
      "matchCount": {
        "label": "匹配试次数"
      },
      "nonmatchCount": {
        "label": "非匹配试次数"
      }
    },
    "experienceHeadline": "dPrime",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "在心里轻轻记住最近两个音，新音响起时和「往前第二个」比较。",
      "不要把整段旋律都记住，只追踪滑动窗口内的两个音。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次听觉工作记忆更新表现，不是诊断或人口常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "听到新音时，你如何边记边比较？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，本次匹配区分指标 d′ 为 {dPrime}。",
        "metricKeys": [
          "dPrime"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你的 d′ 为 {dPrime}；体验版试次少，仅供体验。",
          "metricKeys": [
            "dPrime"
          ]
        }
      },
      "studentMetricKeys": [
        "dPrime",
        "hitRate"
      ],
      "processMetricKeys": [
        "falseAlarmRate",
        "medianHitRtMs"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientTargets",
        "excessiveOmissions",
        "floorPerformance",
        "stimulusEchoMismatch"
      ],
      "metricGates": {},
      "nextStep": "先确认是否有足够的匹配和非匹配记录，再结合命中率与误报率阅读。想再尝试时，可以先重看例子；熟悉任务后的变化不等同于日常能力或训练效果提高。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "hitRate",
          "falseAlarmRate"
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
      "illustration": "signal",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "你会在耳机里听到一串高低不同的音。规则只有一条：新音和「往前数第二个」一样时，就按键。你脑中要像拿着一张便签，不断把旧音划掉、写上新音——这个「不断更新」的动作，正是工作记忆的核心。",
        "takeaway": "这次任务需要边听边更新；单次表现不等于记忆容量或日常能力。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "传话时记住「先找张老师，再找李老师」，中途计划还会被打断更新——这种脑子里随时改清单的能力，就是听觉工作记忆在干活。",
        "scene": "signal",
        "frames": [
          {
            "title": "听新音",
            "text": "每个音只响很短的时间。"
          },
          {
            "title": "和往前第二个比",
            "text": "一样就按键，不一样就等下一个。"
          },
          {
            "title": "随时更新",
            "text": "脑中的「便签」永远只留最近两个音。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "dPrime": {
            "label": "分得有多准",
            "explanation": "结合本次命中和误报情况的区分指标，不直接判断猜测或能力等级。"
          },
          "hitRate": {
            "label": "抓住了多少",
            "explanation": "出现匹配音时你按键的比例。"
          },
          "falseAlarmRate": {
            "label": "非匹配音的按键比例",
            "explanation": "不是匹配音时你按了键的比例。"
          }
        }
      },
      "professional": {
        "construct": "听觉信息的滑动窗口保持与更新（工作记忆更新）",
        "procedure": "纯音序列（toneFrequenciesHz）以 stimulusMs/isiMs 节奏播放；位置 i（i≥nLevel）按 targetRatio 决定是否与第 i−n 音相同；参与者在匹配音出现时按键（响应窗口覆盖音符与静默期）。音序列由服务端按 randomSeed 重建；d′ 采用 Hautus 校正。",
        "interpretation": "d′ 综合命中率与误报率，是主要指标；漏按率高提示注意脱离，误报率高提示反应标准偏松（criterion shift）；命中反应时可作为次要参考。",
        "confounders": [
          "音高辨别困难（听力或设备问题）会被误判为记忆失败；施测前需完成音量自检。",
          "音频输出延迟影响 rt 对齐但不影响命中/误报判定。",
          "本报告不提供经过验证的人口常模、诊断或学习障碍结论。"
        ],
        "metricNotes": {
          "dPrime": {
            "definition": "Hautus 校正 d′ = Φ⁻¹((hits+0.5)/(matchN+1)) − Φ⁻¹((FA+0.5)/(nonmatchN+1))。",
            "readingHint": "0 附近为随机水平；分数锚点 d′ 0→0、4→100。"
          },
          "hitRate": {
            "definition": "hits / matchCount。",
            "readingHint": "与 falseAlarmRate 联合阅读。"
          },
          "falseAlarmRate": {
            "definition": "falseAlarms / nonmatchCount。",
            "readingHint": "偏高提示反应标准偏松。"
          },
          "medianHitRtMs": {
            "definition": "命中试次（rtMs 非空）反应时中位数。",
            "readingHint": "描述性指标，不进入主结论。"
          },
          "matchCount": {
            "definition": "服务端序列中 seq[i]==seq[i−n] 的位置数（i≥n）。",
            "readingHint": "由设计决定；低于 6 触发 insufficientTargets。"
          },
          "nonmatchCount": {
            "definition": "服务端序列中非匹配位置数。",
            "readingHint": "与 matchCount 对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "nLevel",
            "label": "n 水平"
          },
          {
            "key": "totalTrials",
            "label": "计划试次数"
          },
          {
            "key": "targetRatio",
            "label": "目标比例"
          },
          {
            "key": "stimulusMs",
            "label": "音符时长（毫秒）"
          },
          {
            "key": "isiMs",
            "label": "静默间隔（毫秒）"
          },
          {
            "key": "toneFrequenciesHz",
            "label": "纯音频率集（Hz）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "auditorynback",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "在声音流中跟踪前面的音",
    "metrics": {
      "dPrime": {
        "label": "匹配区分指标（d′）",
        "explanation": "Z((命中数+0.5)/(目标数+1)) − Z((误报数+0.5)/(非目标数+1))。 合看两类反应；不是百分比、常模或能力分，机会不足不解释。",
        "singleExplanation": "Z((命中数+0.5)/(目标数+1)) − Z((误报数+0.5)/(非目标数+1))。 合看两类反应；不是百分比、常模或能力分，机会不足不解释。"
      },
      "hitRate": {
        "label": "匹配声音的命中比例",
        "explanation": "命中率：出现匹配音时你按键的比例。"
      },
      "falseAlarmRate": {
        "label": "非匹配声音的误报比例",
        "explanation": "误报率：不是匹配音时你按了键的比例。"
      },
      "medianHitRtMs": {
        "label": "匹配命中的典型用时"
      },
      "matchCount": {
        "label": "实际匹配机会数",
        "explanation": "前两个音后，实际与隔一个声音相同的可评分机会数。 不是计划总音数的固定30%；需看实际数量。",
        "singleExplanation": "前两个音后，实际与隔一个声音相同的可评分机会数。 不是计划总音数的固定30%；需看实际数量。"
      },
      "nonmatchCount": {
        "label": "实际非匹配机会数",
        "explanation": "前两个音后，实际不同的可评分机会数。 不按这些音是正确拒绝，不是缺失。",
        "singleExplanation": "前两个音后，实际不同的可评分机会数。 不按这些音是正确拒绝，不是缺失。"
      }
    },
    "experienceHeadline": "matchCount",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先看实际匹配与非匹配次数。短版目标数可能不足，不能把无结果或低值当作能力不足；噪声与音高辨别也会影响表现。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次听觉工作记忆更新表现，不是诊断或人口常模判断。",
    "reportReading": {
      "version": "3.0.0",
      "title": "在声音流中跟踪前面的音",
      "introduction": "像在一串提示音中跟踪刚才出现过的音，这里观察本次音高匹配，不给记忆能力定级。",
      "summary": {
        "template": "这一次，本次匹配区分指标 d′ 为 {dPrime}。",
        "metricKeys": [
          "dPrime"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次短程声音跟踪中，实际匹配机会有 {matchCount}，非匹配机会有 {nonmatchCount}；机会少时不解释区分指标。",
          "metricKeys": [
            "matchCount",
            "nonmatchCount"
          ]
        }
      },
      "studentMetricKeys": [
        "matchCount",
        "nonmatchCount",
        "hitRate"
      ],
      "processMetricKeys": [
        "matchCount",
        "nonmatchCount"
      ],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientTargets",
        "excessiveOmissions",
        "floorPerformance",
        "stimulusEchoMismatch"
      ],
      "metricGates": {},
      "nextStep": "先看实际匹配与非匹配次数。短版目标数可能不足，不能把无结果或低值当作能力不足；噪声与音高辨别也会影响表现。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "hitRate",
          "falseAlarmRate"
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
      "illustration": "signal",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "像在一串提示音中跟踪刚才出现过的音，这里观察本次音高匹配，不给记忆能力定级。",
        "takeaway": "把现在的音与隔一个的音比较；没有匹配时不按也是任务的一部分。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "像听一段旋律时发现同一个音再次出现；本任务只把现在的音与隔一个的音比较，不代表日常音乐或记忆能力。d′把命中与误报合起来看，不是正确率、百分位或能力分。",
        "scene": "signal",
        "frames": [
          {
            "title": "听当前的音",
            "text": "先听清音高，开头两个音用于建立比较。"
          },
          {
            "title": "和隔一个的音比较",
            "text": "相同就按，不相同就不按。"
          },
          {
            "title": "继续跟住声音",
            "text": "每出现一个新音，就重新比较。"
          }
        ],
        "boundary": "生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。",
        "metricHelp": {
          "dPrime": {
            "label": "匹配区分指标（d′）",
            "explanation": "Z((命中数+0.5)/(目标数+1)) − Z((误报数+0.5)/(非目标数+1))。 合看两类反应；不是百分比、常模或能力分，机会不足不解释。"
          },
          "hitRate": {
            "label": "匹配声音的命中比例",
            "explanation": "命中率：出现匹配音时你按键的比例。"
          },
          "falseAlarmRate": {
            "label": "非匹配声音的误报比例",
            "explanation": "误报率：不是匹配音时你按了键的比例。"
          }
        }
      },
      "professional": {
        "construct": "五纯音固定2-back的项目变式",
        "procedure": "纯音序列（toneFrequenciesHz）以 stimulusMs/isiMs 节奏播放；位置 i（i≥nLevel）按 targetRatio 决定是否与第 i−n 音相同；参与者在匹配音出现时按键（响应窗口覆盖音符与静默期）。音序列由服务端按 randomSeed 重建；d′ 采用 Hautus 校正。",
        "interpretation": "开头两个音不进命中/误报分母；后续不按目标算漏按，不按非目标算正确拒绝。目标数由随机过程决定，不是固定30%。d′用了加0.5的极端比例修正；目标少于6时不解释，体验档通常不足。",
        "confounders": [
          "音高辨别困难（听力或设备问题）会被误判为记忆失败；施测前需完成音量自检。",
          "音频输出延迟影响 rt 对齐但不影响命中/误报判定。",
          "本报告不提供经过验证的人口常模、诊断或学习障碍结论。"
        ],
        "metricNotes": {
          "dPrime": {
            "definition": "Z((命中数+0.5)/(目标数+1)) − Z((误报数+0.5)/(非目标数+1))。",
            "readingHint": "合看两类反应；不是百分比、常模或能力分，机会不足不解释。"
          },
          "hitRate": {
            "definition": "hits / matchCount。",
            "readingHint": "与 falseAlarmRate 联合阅读。"
          },
          "falseAlarmRate": {
            "definition": "falseAlarms / nonmatchCount。",
            "readingHint": "偏高提示反应标准偏松。"
          },
          "medianHitRtMs": {
            "definition": "命中试次（rtMs 非空）反应时中位数。",
            "readingHint": "描述性指标，不进入主结论。"
          },
          "matchCount": {
            "definition": "前两个音后，实际与隔一个声音相同的可评分机会数。",
            "readingHint": "不是计划总音数的固定30%；需看实际数量。"
          },
          "nonmatchCount": {
            "definition": "前两个音后，实际不同的可评分机会数。",
            "readingHint": "不按这些音是正确拒绝，不是缺失。"
          }
        },
        "configFields": [
          {
            "key": "nLevel",
            "label": "n 水平"
          },
          {
            "key": "totalTrials",
            "label": "计划试次数"
          },
          {
            "key": "targetRatio",
            "label": "目标比例"
          },
          {
            "key": "stimulusMs",
            "label": "音符时长（毫秒）"
          },
          {
            "key": "isiMs",
            "label": "静默间隔（毫秒）"
          },
          {
            "key": "toneFrequenciesHz",
            "label": "纯音频率集（Hz）"
          }
        ]
      },
      "hiddenByProfile": {
        "experience": [
          "dPrime",
          "medianHitRtMs"
        ]
      }
    }
  }
]
