import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

// Original C/S/R declarations remain addressable; R3 is explicit per identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.0.1",
    "testType": "sentencecheck",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "句图验证推理",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中判断正确的比例。",
        "singleExplanation": "总体正确率：正式作答中判断正确的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。",
        "singleExplanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。"
      },
      "negationPenaltyMs": {
        "label": "否定句代价",
        "explanation": "否定句代价：否定句与肯定句的正确有效用时中位数之差；正值表示否定句较慢，负值表示较快，0 表示两者相同。",
        "singleExplanation": "否定句代价：否定句减肯定句的正确有效用时中位数之差，可正、可负，也可为 0。"
      },
      "errorCount": {
        "label": "错误次数"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validRtCount": {
        "label": "有效正确RT数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先弄清句子说的是形状还是颜色，再核对图片。",
      "遇到“不是”先转换成“它是什么”，再比较。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只描述本次句图验证的表现，不是语言能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "1.0.1",
      "title": "这句话，和图片对得上吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你判断对了 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你判断对了 {accuracy}；试次较少，否定与肯定句的用时差需谨慎阅读。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "medianRtMs",
        "negationPenaltyMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidRt",
        "lowAccuracy"
      ],
      "metricGates": {
        "negationPenaltyMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先看正确率，再看两类句子的用时差。回想是否漏看了“不是”，下次可先确认句子说的是哪个属性；中断时只参考已记录的部分。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "negationPenaltyMs"
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
        "concept": "每题给一句话和一张图，比如“圆形不是蓝色的”。你要核对句子和图是否相符。含“不是”的句子需要多转一个弯——这也是任务想观察的加工过程。",
        "takeaway": "先确定句子在说什么，再一步核对。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "核对通知条款、读实验步骤、理解“不在名单上”这类表述，都需要准确的句子核对。这只反映语言核对的一小部分，不代表阅读能力或智力的全貌。",
        "scene": "rules",
        "frames": [
          {
            "title": "读句子",
            "text": "弄清问的是形状还是颜色。"
          },
          {
            "title": "核对图片",
            "text": "把句子内容与图片对照。"
          },
          {
            "title": "判相符",
            "text": "相符按对，不符按错。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "判对了多少",
            "explanation": "正式作答中判断正确的比例。"
          },
          "medianRtMs": {
            "label": "典型用时",
            "explanation": "判断正确且达到最低有效用时的试次中，从句子出现到作答的典型时间。"
          },
          "negationPenaltyMs": {
            "label": "“不是”多花多久",
            "explanation": "否定句减肯定句的正确有效用时中位数之差；正值较慢，负值较快，0 表示相同。"
          }
        }
      },
      "professional": {
        "construct": "句法语义核对（含否定的句图验证）",
        "procedure": "逐试次呈现一句关于图形形状或颜色的陈述与一张合成图形；陈述真伪由服务端按形状/颜色事实与 askedValue 权威推导；正确率与正确有效 RT（rtMs ≥ validRtFloorMs）为主要指标；否定句代价为否定与肯定条件中位 RT 之差。",
        "interpretation": "同时阅读正确率、有效反应数与否定句代价；代价受否定比率与试次数影响，不直接推断语言能力等级。",
        "confounders": [
          "阅读熟练度与输入方式影响用时记录。",
          "模板集有限，重复 exposure 带来学习效应。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中与陈述真伪一致判断的比例。",
            "readingHint": "低于 0.5 时用时指标需谨慎解释。"
          },
          "medianRtMs": {
            "definition": "正确有效反应的中位时间。",
            "readingHint": "与正确率同读。"
          },
          "negationPenaltyMs": {
            "definition": "否定条件正确有效 RT 中位数减肯定条件中位数；任一条件没有有效记录时为 null。",
            "readingHint": "有符号量；0 是实际差值，null 是缺少条件记录。整体正确有效 RT 少于 2 条会触发质量限制。"
          },
          "errorCount": {
            "definition": "已作答但判断错误的次数，不含超时。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "未作答（response 为 null）的次数。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "negationRatio",
            "label": "否定句比例"
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
    "presentationVersion": "1.1.0",
    "testType": "sentencecheck",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "title": "句图验证推理",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中判断正确的比例。",
        "singleExplanation": "总体正确率：正式作答中判断正确的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。",
        "singleExplanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。"
      },
      "negationPenaltyMs": {
        "label": "否定与肯定用时差",
        "explanation": "否定句正确有效用时中位数减肯定句中位数；是本次条件差，不代表否定加工的因果代价。",
        "singleExplanation": "本次否定句与肯定句的正确有效用时中位数之差，可正、可负、可为0；任一条件没有有效记录为null。"
      },
      "errorCount": {
        "label": "错误次数"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validRtCount": {
        "label": "有效正确RT数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "肯定句和否定句都可能相符或不相符，请每题核对图片。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次自编句图核对，不作诊断或年龄比较；条件安排与旧版不同，结果不直接比较。",
    "reportReading": {
      "version": "1.1.0",
      "title": "这句话，和图片对得上吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你判断对了 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你判断对了 {accuracy}；试次较少，否定与肯定句的用时差需谨慎阅读。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "medianRtMs",
        "negationPenaltyMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidRt",
        "lowAccuracy"
      ],
      "metricGates": {
        "negationPenaltyMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先结合正确率、超时和有效正确反应数阅读，再描述两类句子的用时差；不要用这个差值判断语言能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "negationPenaltyMs"
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
        "concept": "每题读一句关于形状或颜色的话，再核对图片。肯定句和否定句都可能相符，也可能不相符；有没有“不是”不能单独决定答案。",
        "takeaway": "先确定句子在说什么，再一步核对。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "核对通知条款、读实验步骤、理解“不在名单上”这类表述，都需要准确的句子核对。这只反映语言核对的一小部分，不代表阅读能力或智力的全貌。",
        "scene": "rules",
        "frames": [
          {
            "title": "读句子",
            "text": "弄清问的是形状还是颜色。"
          },
          {
            "title": "核对图片",
            "text": "把句子内容与图片对照。"
          },
          {
            "title": "判相符",
            "text": "相符按对，不符按错。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "判对了多少",
            "explanation": "正式作答中判断正确的比例。"
          },
          "medianRtMs": {
            "label": "典型用时",
            "explanation": "判断正确且达到最低有效用时的试次中，从句子出现到作答的典型时间。"
          },
          "negationPenaltyMs": {
            "label": "两类句子用时差",
            "explanation": "本次否定句与肯定句的正确有效用时中位数之差；它会受阅读、题目和反应选择影响。"
          }
        }
      },
      "professional": {
        "construct": "自编中文颜色/形状句图核对",
        "procedure": "真假与肯定/否定按四格交叉安排，保留各自计划数量；不能整除时四格尽量接近比例。服务端按种子和配置重建形状、颜色、问属性、否定与问值，再使用既有正确率和有效正确RT公式。",
        "interpretation": "用时差仅为本次描述性条件差，不能认定否定加工的因果代价；不与旧版条件混淆的记录直接比较。",
        "confounders": [
          "阅读熟练度与输入方式影响用时记录。",
          "模板集有限，重复 exposure 带来学习效应。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。",
          "四条件覆盖纠正了旧版混淆，尚无本项目版本的信效度验证。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中与陈述真伪一致判断的比例。",
            "readingHint": "低于 0.5 时用时指标需谨慎解释。"
          },
          "medianRtMs": {
            "definition": "正确有效反应的中位时间。",
            "readingHint": "与正确率同读。"
          },
          "negationPenaltyMs": {
            "definition": "否定条件正确有效RT中位数减肯定条件中位数；任一条件无有效记录为null。",
            "readingHint": "每个真假×否定条件均有计划试次不保证每格有足够正确RT；只作本次描述，不作因果或能力等级推断。"
          },
          "errorCount": {
            "definition": "已作答但判断错误的次数，不含超时。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "未作答（response 为 null）的次数。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "negationRatio",
            "label": "否定句比例"
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
    "testType": "sentencecheck",
    "engineVersion": "1.0.1",
    "scoringVersion": "1.0.0",
    "title": "核对一句话和一幅图",
    "metrics": {
      "accuracy": {
        "label": "本次题目判断正确率",
        "explanation": "总体正确率：正式作答中判断正确的比例。",
        "singleExplanation": "总体正确率：正式作答中判断正确的比例。"
      },
      "medianRtMs": {
        "label": "正确判断的典型用时",
        "explanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。",
        "singleExplanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。"
      },
      "negationPenaltyMs": {
        "label": "当前两类题目的用时差（不作能力解释）",
        "explanation": "否定正确反应中位数减肯定正确反应中位数；当前两类同时混入真假差异。 新报告不展示该差值，不作否定加工解释。",
        "singleExplanation": "否定正确反应中位数减肯定正确反应中位数；当前两类同时混入真假差异。 新报告不展示该差值，不作否定加工解释。"
      },
      "errorCount": {
        "label": "错误次数"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validRtCount": {
        "label": "有效正确作答数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [
      "negationPenaltyMs"
    ],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "先看是否读清句子和图形。本版不解释否定加工代价，也不把高正确率当作语言理解能力。"
    ],
    "singleHiddenMetrics": [
      "negationPenaltyMs"
    ],
    "disclaimer": "结果只描述本次句图验证的表现，不是语言能力、智力或年龄常模判断。",
    "reportReading": {
      "version": "3.0.0",
      "title": "核对一句话和一幅图",
      "introduction": "这是自编的句图核对小游戏，记录本次判断与作答过程，不是标准语言或智力测验。",
      "summary": {
        "template": "这次题目判断正确率为 {accuracy}。当前真假与否定条件混淆，不能据此分离语言理解能力。",
        "metricKeys": [
          "accuracy"
        ]
      },
      "summaryByProfile": {},
      "studentMetricKeys": [
        "accuracy",
        "medianRtMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidRt",
        "lowAccuracy"
      ],
      "metricGates": {
        "negationPenaltyMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先看是否读清句子和图形。本版不解释否定加工代价，也不把高正确率当作语言理解能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": []
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
        "concept": "这是自编的句图核对小游戏，记录本次判断与作答过程，不是标准语言或智力测验。",
        "takeaway": "先读清句子，再核对图形；当前条件混淆限制了结果解释。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "例如核对一句颜色说明与图标是否相符；当前真假与否定条件混淆，结果不能分离否定理解能力。",
        "scene": "rules",
        "frames": [
          {
            "title": "读句子",
            "text": "弄清问的是形状还是颜色。"
          },
          {
            "title": "核对图片",
            "text": "把句子内容与图片对照。"
          },
          {
            "title": "判相符",
            "text": "相符按对，不符按错。"
          }
        ],
        "boundary": "生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。",
        "metricHelp": {
          "accuracy": {
            "label": "本次题目判断正确率",
            "explanation": "总体正确率：正式作答中判断正确的比例。"
          },
          "medianRtMs": {
            "label": "正确判断的典型用时",
            "explanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。"
          }
        }
      },
      "professional": {
        "construct": "自编句图相符判断（真伪与否定条件混淆）",
        "procedure": "自编颜色/形状句子与图形核对。服务端按回显形状、颜色和问值推导真假；正确率以计划题数为分母，正确且至少300毫秒的反应进入用时统计。当前真假与否定重合，新报告不展示否定差值。",
        "interpretation": "当前否定句与真命题重合、肯定句与假命题重合；用时差无法分离否定加工。只描述本次正确、超时及有效作答，不据此推断语言理解能力。",
        "confounders": [
          "阅读熟练度与输入方式影响用时记录。",
          "模板集有限，重复 exposure 带来学习效应。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中与陈述真伪一致判断的比例。",
            "readingHint": "低于 0.5 时用时指标需谨慎解释。"
          },
          "medianRtMs": {
            "definition": "正确有效反应的中位时间。",
            "readingHint": "与正确率同读。"
          },
          "negationPenaltyMs": {
            "definition": "否定正确反应中位数减肯定正确反应中位数；当前两类同时混入真假差异。",
            "readingHint": "新报告不展示该差值，不作否定加工解释。"
          },
          "errorCount": {
            "definition": "已作答但判断错误的次数，不含超时。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "未作答（response 为 null）的次数。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "negationRatio",
            "label": "否定句比例"
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
    "testType": "sentencecheck",
    "engineVersion": "1.1.0",
    "scoringVersion": "1.1.0",
    "title": "句子和图片对一对",
    "metrics": {
      "accuracy": {
        "label": "总体正确率",
        "explanation": "总体正确率：正式作答中判断正确的比例。",
        "singleExplanation": "总体正确率：正式作答中判断正确的比例。"
      },
      "medianRtMs": {
        "label": "正确作答中位用时",
        "explanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。",
        "singleExplanation": "正确作答中位用时：判断正确且达到本次最低有效用时的试次中，从句子出现到作答的典型时间。"
      },
      "negationPenaltyMs": {
        "label": "否定与肯定用时差",
        "explanation": "否定句正确有效用时中位数减肯定句中位数；是本次条件差，不代表否定加工的因果代价。",
        "singleExplanation": "本次否定句与肯定句的正确有效用时中位数之差，可正、可负、可为0；任一条件没有有效记录为null。"
      },
      "errorCount": {
        "label": "错误次数"
      },
      "timeoutCount": {
        "label": "超时次数"
      },
      "validRtCount": {
        "label": "有效正确RT数"
      }
    },
    "experienceHeadline": "accuracy",
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {},
    "practicalTips": [
      "肯定句和否定句都可能相符或不相符，请每题核对图片。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "只描述本次自编句图核对，不作诊断或年龄比较；条件安排与旧版不同，结果不直接比较。",
    "reportReading": {
      "version": "3.0.0",
      "title": "这句话，说的是眼前的图吗？",
      "introduction": "从这次作答出发，读懂一个与你有关的认知过程。",
      "summary": {
        "template": "这一次，你判断对了 {accuracy}；正确判断的典型用时是 {medianRtMs}。",
        "metricKeys": [
          "accuracy",
          "medianRtMs"
        ]
      },
      "summaryByProfile": {
        "experience": {
          "template": "这次简短体验中，你判断对了 {accuracy}；试次较少，否定与肯定句的用时差需谨慎阅读。",
          "metricKeys": [
            "accuracy"
          ]
        }
      },
      "studentMetricKeys": [
        "accuracy",
        "medianRtMs",
        "negationPenaltyMs"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientValidRt",
        "lowAccuracy"
      ],
      "metricGates": {
        "negationPenaltyMs": [
          "insufficientValidRt"
        ]
      },
      "nextStep": "先结合正确率、超时和有效正确反应数阅读，再描述两类句子的用时差；不要用这个差值判断语言能力。",
      "chart": {
        "kind": "metrics",
        "metricKeys": [
          "negationPenaltyMs"
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
        "concept": "每题读一句关于形状或颜色的话，再核对图片。肯定句和否定句都可能相符，也可能不相符；有没有“不是”不能单独决定答案。",
        "takeaway": "先确定句子在说什么，再一步核对。",
        "exampleTitle": "走出任务：生活里的一个例子",
        "example": "核对通知条款、读实验步骤、理解“不在名单上”这类表述，都需要准确的句子核对。这只反映语言核对的一小部分，不代表阅读能力或智力的全貌。",
        "scene": "rules",
        "frames": [
          {
            "title": "读句子",
            "text": "弄清问的是形状还是颜色。"
          },
          {
            "title": "核对图片",
            "text": "把句子内容与图片对照。"
          },
          {
            "title": "判相符",
            "text": "相符按对，不符按错。"
          }
        ],
        "boundary": "这是理解概念的场景示例，不是职业资格、考试排名或同龄人比较。",
        "metricHelp": {
          "accuracy": {
            "label": "判对了多少",
            "explanation": "正式作答中判断正确的比例。"
          },
          "medianRtMs": {
            "label": "典型用时",
            "explanation": "判断正确且达到最低有效用时的试次中，从句子出现到作答的典型时间。"
          },
          "negationPenaltyMs": {
            "label": "两类句子用时差",
            "explanation": "本次否定句与肯定句的正确有效用时中位数之差；它会受阅读、题目和反应选择影响。"
          }
        }
      },
      "professional": {
        "construct": "自编中文颜色/形状句图核对",
        "procedure": "真假与肯定/否定按四格交叉安排，保留各自计划数量；不能整除时四格尽量接近比例。服务端按种子和配置重建形状、颜色、问属性、否定与问值，再使用既有正确率和有效正确RT公式。",
        "interpretation": "用时差仅为本次描述性条件差，不能认定否定加工的因果代价；不与旧版条件混淆的记录直接比较。",
        "confounders": [
          "阅读熟练度与输入方式影响用时记录。",
          "模板集有限，重复 exposure 带来学习效应。",
          "本报告不提供经过验证的人口常模、诊断、语言能力或智力等级结论。",
          "四条件覆盖纠正了旧版混淆，尚无本项目版本的信效度验证。"
        ],
        "metricNotes": {
          "accuracy": {
            "definition": "正确率：正式作答中与陈述真伪一致判断的比例。",
            "readingHint": "低于 0.5 时用时指标需谨慎解释。"
          },
          "medianRtMs": {
            "definition": "正确有效反应的中位时间。",
            "readingHint": "与正确率同读。"
          },
          "negationPenaltyMs": {
            "definition": "否定条件正确有效RT中位数减肯定条件中位数；任一条件无有效记录为null。",
            "readingHint": "每个真假×否定条件均有计划试次不保证每格有足够正确RT；只作本次描述，不作因果或能力等级推断。"
          },
          "errorCount": {
            "definition": "已作答但判断错误的次数，不含超时。",
            "readingHint": "与正确率互补阅读。"
          },
          "timeoutCount": {
            "definition": "未作答（response 为 null）的次数。",
            "readingHint": "超时过多时解释需谨慎。"
          },
          "validRtCount": {
            "definition": "进入用时统计的正确有效反应数。",
            "readingHint": "与计划试次总数对照阅读。"
          }
        },
        "configFields": [
          {
            "key": "totalTrials",
            "label": "计划正式试次数"
          },
          {
            "key": "negationRatio",
            "label": "否定句比例"
          },
          {
            "key": "timeoutMs",
            "label": "响应时限（毫秒）"
          }
        ]
      }
    }
  }
]
