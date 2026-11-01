import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original declarations stay first; only explicit reportVersion 3.0.0 selects this revision.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "sizecongruity",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "数量大小比较",
    "metrics": {
      "sizeCongruityEffectMs": {
        "label": "数量一致性效应",
        "explanation": "数量一致性效应：不一致条件减一致条件的正确有效作答中位用时；正值表示本次不一致条件较慢，负值表示较快，要连同正确率一起看。",
        "singleExplanation": "数量一致性效应：不一致条件减一致条件的正确有效作答中位用时，保留正负号。"
      },
      "incongruentAccuracy": {
        "label": "不一致条件正确率",
        "explanation": "不一致条件正确率：数字外观与数值打架时，仍按数值规则正确作答的比例。",
        "singleExplanation": "不一致条件正确率：数字外观与数值打架时，仍按数值规则正确作答的比例。"
      },
      "accuracy": {
        "label": "总体正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "congruentAccuracy": {
        "label": "一致条件正确率",
        "explanation": "一致条件正确率：数字外观与数值方向一致时正确作答的比例。",
        "singleExplanation": "一致条件正确率：数字外观与数值方向一致时正确作答的比例。"
      },
      "medianRtCongruent": {
        "label": "一致条件典型反应时间",
        "explanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。",
        "singleExplanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。"
      },
      "medianRtIncongruent": {
        "label": "不一致条件典型反应时间",
        "explanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。",
        "singleExplanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validCongruentRtCount": {
        "label": "一致有效RT数"
      },
      "validIncongruentRtCount": {
        "label": "不一致有效RT数"
      }
    },
    "experienceHeadline": "incongruentAccuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "只比较数值大小，忽略数字显示的大小；先确认规则再作答。",
      "回想自己是否曾跟着字号选答案；下次先确认比较的是数值，在时限内按同一规则作答。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次数量比较的表现，不是数学能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "数字“打架”时，你看得清数值吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "数值与外观冲突时，你这次答对了 {incongruentAccuracy}；不一致条件减一致条件的正确作答典型用时为 {sizeCongruityEffectMs}。",
        "metricKeys": [
          "sizeCongruityEffectMs",
          "incongruentAccuracy"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，冲突条件下你答对了 {incongruentAccuracy}；短程干扰效应不稳，仅供体验。",
          "metricKeys": [
            "incongruentAccuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "sizeCongruityEffectMs",
        "incongruentAccuracy",
        "congruentAccuracy"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidCongruentRt",
        "insufficientValidIncongruentRt"
      ],
      "metricGates": {},
      "nextStep": "先比较两种条件的正确率，再读用时差。想一想是否有过被字号带着走的时刻；下次先提醒自己“比数值”，再作答。负差值也不代表抑制能力优秀。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "medianRtCongruent",
          "medianRtIncongruent"
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "先弄懂，这个任务在看什么",
        "concept": "7 写得很小、3 写得很大时，眼睛想选 3，规则却要你选数值大的 7。这个任务比较两种情况：外观帮你（一致）和外观拦你（不一致），看这一次处理干扰的过程。",
        "takeaway": "看清规则，再让第一反应让路。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "价格标签的大小和金额不一致、标题字号和重要性不符，都需要按信息本身而不是外观判断。这里的数字干扰不等于日常专注力或数学能力的全貌。",
        "scene": "rules",
        "frames": [
          {
            "title": "确认规则",
            "text": "比的是数值，不是字号。"
          },
          {
            "title": "忽略干扰",
            "text": "外观与数值打架时按数值判断。"
          },
          {
            "title": "回看记录",
            "text": "用一致与不一致的差值理解过程。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、职业适合度或同龄人排名。",
        "metricHelp": {
          "sizeCongruityEffectMs": {
            "label": "多一层干扰，用时差了多少",
            "explanation": "不一致条件减一致条件的正确有效作答中位用时；正值表示本次不一致条件较慢，负值表示较快，不能单凭差值判断能力。"
          },
          "incongruentAccuracy": {
            "label": "有干扰时，判断正确多少",
            "explanation": "外观与数值冲突时仍按数值正确作答的比例。"
          },
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "congruentAccuracy": {
            "label": "外观与数值一致时，判断正确多少",
            "explanation": "外观与数值一致时正确作答的比例。"
          }
        }
      },
      "professional": {
        "construct": "数值—物理大小一致性条件下的干扰效应",
        "procedure": "按一致/不一致条件分别计算正确率和有效正确反应 RT；一致性效应为不一致条件中位 RT 减一致条件中位 RT。数值较大侧与条件均由服务端推导。",
        "interpretation": "同时阅读条件正确率、有效反应数与差值。差值受数值距离效应与速度—准确率权衡影响，不直接推断抑制能力等级。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "数值间距（minGap）与字号比例由 frozen config 决定，跨 config 不可比。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。"
        ],
        "metricNotes": {
          "sizeCongruityEffectMs": {
            "definition": "不一致条件的正确反应中位 RT 减去一致条件的正确反应中位 RT。",
            "readingHint": "需要两条件足够有效记录；保留符号，不凭差值判断个体抑制能力。"
          },
          "incongruentAccuracy": {
            "definition": "不一致条件正确率：外观与数值方向不一致的全部正式试次中，按数值正确作答的比例；未回应也计入分母。",
            "readingHint": "与一致性效应同读。"
          },
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "低于 0.5 时干扰指标需谨慎解释。"
          },
          "congruentAccuracy": {
            "definition": "一致条件正确率：外观与数值方向一致的全部正式试次中，正确作答的比例；未回应也计入分母。",
            "readingHint": "与不一致条件正确率对照阅读。"
          },
          "medianRtCongruent": {
            "definition": "一致条件的正确有效反应中位时间。",
            "readingHint": "只在足够有效记录下作描述性比较。"
          },
          "medianRtIncongruent": {
            "definition": "不一致条件的正确有效反应中位时间。",
            "readingHint": "只在足够有效记录下作描述性比较。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validCongruentRtCount": {
            "definition": "按本次冻结任务定义记录“一致有效RT数”。",
            "readingHint": "与计划试次数对照阅读。"
          },
          "validIncongruentRtCount": {
            "definition": "按本次冻结任务定义记录“不一致有效RT数”。",
            "readingHint": "与计划试次数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "fontLargeRem",
            "label": "大字号（rem）"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          }
        ]
      }
    }
  },
  {
    "schemaVersion": 1,
    "presentationVersion": "3.0.0",
    "testType": "sizecongruity",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "看数值，不看字号",
    "metrics": {
      "sizeCongruityEffectMs": {
        "label": "字号冲突比同向多用的时间",
        "explanation": "数量一致性效应：不一致条件减一致条件的正确有效作答中位用时；正值表示本次不一致条件较慢，负值表示较快，要连同正确率一起看。",
        "singleExplanation": "数量一致性效应：不一致条件减一致条件的正确有效作答中位用时，保留正负号。"
      },
      "incongruentAccuracy": {
        "label": "字号冲突时答对比例",
        "explanation": "不一致条件正确率：数字外观与数值打架时，仍按数值规则正确作答的比例。",
        "singleExplanation": "不一致条件正确率：数字外观与数值打架时，仍按数值规则正确作答的比例。"
      },
      "accuracy": {
        "label": "总体正确率",
        "explanation": "正确率：正式作答中判断正确的比例。",
        "singleExplanation": "正确率：正式作答中判断正确的比例。"
      },
      "congruentAccuracy": {
        "label": "字号同向时答对比例",
        "explanation": "一致条件正确率：数字外观与数值方向一致时正确作答的比例。",
        "singleExplanation": "一致条件正确率：数字外观与数值方向一致时正确作答的比例。"
      },
      "medianRtCongruent": {
        "label": "同向时答对的通常用时",
        "explanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。",
        "singleExplanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。"
      },
      "medianRtIncongruent": {
        "label": "冲突时答对的通常用时",
        "explanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。",
        "singleExplanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validCongruentRtCount": {
        "label": "一致有效RT数"
      },
      "validIncongruentRtCount": {
        "label": "不一致有效RT数"
      }
    },
    "experienceHeadline": "incongruentAccuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "这份报告描述本次看数值，不看字号的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "16题，两种情况各8题，练习2题最多2轮；配置估计约2分钟（未实测）。只作本次条件比较，无稳定抑制能力判断。",
          "体验16题，同向/冲突各8题，2题练习须全对、最多2轮。错误、超时或过快反应会减少条件内有效用时记录，差值仅描述本次；字体、视力和输入设备有影响。"
        ]
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "这份报告描述本次看数值，不看字号的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ]
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "这份报告描述本次看数值，不看字号的作答记录。",
        "showProductIndex": false,
        "reportCaveats": [
          "研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。",
          "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"
        ]
      }
    },
    "practicalTips": [
      "先读两个数字，再选数值较大的一边。追求速度时，也留意是否把“字更大”误当成“数更大”。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
    "reportReading": {
      "version": "3.0.0",
      "title": "字写得大，数值不一定大",
      "introduction": "一个小小的7和一个大大的3，数值更大的还是7。这个小游戏请你选数值较大的数字，别被字体大小带跑。",
      "summary": {
        "template": "数值与外观冲突时，你这次答对了 {incongruentAccuracy}；不一致条件减一致条件的正确作答典型用时为 {sizeCongruityEffectMs}。",
        "metricKeys": [
          "sizeCongruityEffectMs",
          "incongruentAccuracy"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次短体验：这次简短体验中，冲突条件下你答对了 {incongruentAccuracy}；短程干扰效应不稳，仅供体验。 只描述本次记录，不能据此认定稳定能力。",
          "metricKeys": [
            "incongruentAccuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "sizeCongruityEffectMs",
        "incongruentAccuracy",
        "congruentAccuracy"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidCongruentRt",
        "insufficientValidIncongruentRt"
      ],
      "metricGates": {},
      "nextStep": "先读两个数字，再选数值较大的一边。追求速度时，也留意是否把“字更大”误当成“数更大”。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "medianRtCongruent",
          "medianRtIncongruent"
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
      "illustration": "rules",
      "popular": {
        "conceptTitle": "这个小游戏在观察什么",
        "concept": "两种情况各作比较：数值大的字也大，或数值大的字反而小。记录各自答对的比例和答对时的用时差，不把差值直接当成“自控力”。",
        "takeaway": "用时差可以为负，也可以接近0。先看两种情况各有多少正确有效记录，不把短体验中的一个差值当成稳定结论。",
        "exampleTitle": "把过程放进一个生活场景",
        "example": "价签上的字很大，不代表价格就高；需要读清数字。这只是帮助理解外观与内容不一致的例子，不预测购物决策。",
        "scene": "rules",
        "frames": [
          {
            "title": "确认规则",
            "text": "比的是数值，不是字号。"
          },
          {
            "title": "读清数字",
            "text": "字更大的一边，数值不一定更大。"
          },
          {
            "title": "分别看记录",
            "text": "两种情况的正确比例和用时一起看。"
          }
        ],
        "boundary": "体验16题，同向/冲突各8题，2题练习须全对、最多2轮。错误、超时或过快反应会减少条件内有效用时记录，差值仅描述本次；字体、视力和输入设备有影响。",
        "metricHelp": {
          "sizeCongruityEffectMs": {
            "label": "字号冲突比同向多用的时间",
            "explanation": "不一致条件减一致条件的正确有效作答中位用时；正值表示本次不一致条件较慢，负值表示较快，不能单凭差值判断能力。"
          },
          "incongruentAccuracy": {
            "label": "字号冲突时答对比例",
            "explanation": "外观与数值冲突时仍按数值正确作答的比例。"
          },
          "accuracy": {
            "label": "这次判断正确的比例",
            "explanation": "正确作答占本次正式尝试的比例；只描述这次任务。"
          },
          "congruentAccuracy": {
            "label": "字号同向时答对比例",
            "explanation": "外观与数值一致时正确作答的比例。"
          },
          "medianRtCongruent": {
            "label": "同向时答对的通常用时",
            "explanation": "一致条件典型反应时间：一致条件中正确有效反应的中位时间。"
          },
          "medianRtIncongruent": {
            "label": "冲突时答对的通常用时",
            "explanation": "不一致条件典型反应时间：不一致条件中正确有效反应的中位时间。"
          }
        }
      },
      "professional": {
        "construct": "数值—物理大小一致性条件下的干扰效应",
        "procedure": "按一致/不一致条件分别计算正确率和有效正确反应 RT；一致性效应为不一致条件中位 RT 减一致条件中位 RT。数值较大侧与条件均由服务端推导。 方法与文献核对：研究档96题，一致/不一致各48题，数字1–9且间距至少2，左右位置随机但不保证计数严格相等；500毫秒准备，后续另加300毫秒，响应窗3秒。Henik与Tzelgov(1982), DOI 10.3758/BF03202431，作者上传原文实验1比较数值/物理大小，80种刺激（20一致/20不一致/40中性），2–8数字差2，8题练习、100毫秒注视后呈现至响应；本项目只按数值判断、无中性或反向任务条件，是研究变式。已核该原文方法段；不把80种刺激写成总施测题量，本文未确认的重复次数或缺失处理不宣称一致。",
        "interpretation": "研究版是本项目的较长配置，不是标准化或信效度认证。体验16题，同向/冲突各8题，2题练习须全对、最多2轮。错误、超时或过快反应会减少条件内有效用时记录，差值仅描述本次；字体、视力和输入设备有影响。",
        "confounders": [
          "设备与输入方式、显示和响应延迟会影响用时记录。",
          "数值间距（minGap）与字号比例由 frozen config 决定，跨 config 不可比。",
          "本报告不提供经过验证的人口常模、诊断、稳定能力等级或职业适合度结论。",
          "题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。"
        ],
        "metricNotes": {
          "sizeCongruityEffectMs": {
            "definition": "不一致条件的正确反应中位 RT 减去一致条件的正确反应中位 RT。",
            "readingHint": "需要两条件足够有效记录；保留符号，不凭差值判断个体抑制能力。"
          },
          "incongruentAccuracy": {
            "definition": "不一致条件正确率：外观与数值方向不一致的全部正式试次中，按数值正确作答的比例；未回应也计入分母。",
            "readingHint": "与一致性效应同读。"
          },
          "accuracy": {
            "definition": "正确率：正式作答中判断正确的比例。",
            "readingHint": "低于 0.5 时干扰指标需谨慎解释。"
          },
          "congruentAccuracy": {
            "definition": "一致条件正确率：外观与数值方向一致的全部正式试次中，正确作答的比例；未回应也计入分母。",
            "readingHint": "与不一致条件正确率对照阅读。"
          },
          "medianRtCongruent": {
            "definition": "一致条件的正确有效反应中位时间。",
            "readingHint": "只在足够有效记录下作描述性比较。"
          },
          "medianRtIncongruent": {
            "definition": "不一致条件的正确有效反应中位时间。",
            "readingHint": "只在足够有效记录下作描述性比较。"
          },
          "timeoutCount": {
            "definition": "按本次冻结任务定义记录“超时次数”。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validCongruentRtCount": {
            "definition": "按本次冻结任务定义记录“一致有效RT数”。",
            "readingHint": "与计划试次数对照阅读。"
          },
          "validIncongruentRtCount": {
            "definition": "按本次冻结任务定义记录“不一致有效RT数”。",
            "readingHint": "与计划试次数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式题数/轮数"
          },
          {
            "key": "congruentRatio",
            "label": "一致条件比例"
          },
          {
            "key": "minDigit",
            "label": "最小数字"
          },
          {
            "key": "maxDigit",
            "label": "最大数字"
          },
          {
            "key": "minGap",
            "label": "最小数值间距"
          },
          {
            "key": "fixationMs",
            "label": "准备注视时长（毫秒）"
          },
          {
            "key": "timeoutMs",
            "label": "每题响应上限（毫秒）"
          }
        ]
      }
    }
  }
]
