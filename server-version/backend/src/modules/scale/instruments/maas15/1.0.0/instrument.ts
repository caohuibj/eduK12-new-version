import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text and official scoring instructions transcribed verbatim from the
// "Day-to-Day Experiences" form PDF hosted by the University of Pennsylvania Positive
// Psychology Center (https://ppc.sas.upenn.edu/sites/default/files/mindfulnessscale.pdf).
// Original scale: Brown, K. W., & Ryan, R. M. (2003), Journal of Personality and Social
// Psychology, 84(4), 822-848; the form PDF does not print the citation or a license
// statement. All 15 items are worded as lapses in mindfulness and the anchors run
// 1=Almost Always to 6=Almost Never, so the official "compute a mean of the 15 items"
// scoring needs no reverse scoring (verified item-by-item; see
// docs/mindfulness-content-20261028/maas15/source.md).
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "maas15",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Mindful Attention Awareness Scale, 15-item version",
      "abbreviation": "MAAS-15",
      "instrumentFamily": "Mindful Attention Awareness Scale"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "成人自报日常体验中“走神/自动导航”式不留心体验的出现频次（单维均值 1–6，高分表示自报留心更频繁）；不是正念能力考试、症状筛查或干预疗效判定。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "maas15",
        "domain:mindfulness",
        "domain:self_regulation",
        "construct:mindfulness_maas15_dispositional",
        "construct:mindfulness_maas15_single_dimension",
        "orientation:mindfulness_processes",
        "population:adult_18_plus",
        "population:self_report",
        "response:15_items",
        "response:six_point_frequency",
        "response:no_reverse_items",
        "use:research",
        "use:individual_reflection",
        "use:not_diagnostic",
        "use:not_high_stakes_selection",
        "use:not_school_ranking",
        "use:no_validated_cutoff",
        "license:source_hosted_pdf",
        "license:redistribution_review_pending",
        "language_validation:original_en",
        "成人自评",
        "正念觉察",
        "个人反思",
        "非诊断"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "原版验证为美国大学生与社区成人样本（Brown & Ryan, 2003，Samples A–G，Table 1 年龄范围 17–77 岁）；本条目按 18 岁以上成人自评登记（18 岁下限为产品边界）。State MAAS、MAAS-AANS 青少年版、5 题短版等派生版本题本与计分不同，不据此登记。英文原版无中文人群验证，不将任何中文修订版或其他语言版本的证据套用于此，也不与 KIMS/FFMQ/CAMM 家族条目互换分数或证据。"
    },
    "administration": {
      "itemCount": 15,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "PAPER"
      ],
      "timeFrame": "当前日常经验的出现频次（“currently have each experience”），无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "题干与选项逐字取自 UPenn PPC 公开托管的官方题本 PDF（“Day-to-Day Experiences”）；PDF 原表不印题号，本条目按出现顺序编号 MAAS15_01–15。",
        "选项锚点逐字：1 Almost Always / 2 Very Frequently / 3 Somewhat Frequently / 4 Somewhat Infrequently / 5 Very Infrequently / 6 Almost Never。",
        "官方计分页仅写 “To score the scale, simply compute a mean of the 15 items. Higher scores reflect higher levels of dispositional mindfulness.”，无反向题清单、无逐题 R 标记；15 题全部为不留心式措辞且锚点方向与题干极性相反，直接取均值即方向正确，本条目不设任何反向变换（逐题极性核对与外部佐证见 docs/mindfulness-content-20261028/maas15/source.md）。",
        "第 10 题撇号在 PDF 原文中即为 ASCII 直撇号（与其余各题弯撇号不同），照录不做修复。",
        "任一题缺答均值不计算（null），不把缺答当最低分；complete_required 是产品保守约定，不是原作者规则。",
        "PDF 未印期刊引文与许可条款；预计时长为产品估计，不是原作者实测。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版英文在美国大学生与社区成人样本中开发并验证单因素结构。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "用于成人回顾日常留意当下的习惯与可行小行动，不贴能力、人格或疾病标签。"
        }
      ],
      "forbiddenUses": [
        "DIAGNOSIS",
        "HIGH_STAKES_SELECTION",
        "SCHOOL_RANKING",
        "TEACHER_ACCOUNTABILITY",
        "UNSUPPORTED_GROUP_COMPARISON"
      ]
    },
    "evidence": [
      {
        "evidenceId": "brown-ryan-2003-maas",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US adult samples (undergraduates, community adults, meditators; Samples A–G of the original article; per-sample details are not printed in the form PDF)",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development and validation of a 15-item single-factor dispositional mindfulness measure; official scoring computes a mean of the 15 items (range 1-6) where higher scores reflect higher dispositional mindfulness; all items are worded as lapses in mindfulness and the anchors run 1=almost always to 6=almost never, so no reverse scoring is applied.",
        "rating": "SUFFICIENT",
        "citation": "Brown, K. W., & Ryan, R. M. (2003). The benefits of being present: Mindfulness and its role in psychological well-being. Journal of Personality and Social Psychology, 84(4), 822–848. https://doi.org/10.1037/0022-3514.84.4.822",
        "doi": "10.1037/0022-3514.84.4.822",
        "url": "https://doi.org/10.1037/0022-3514.84.4.822",
        "notes": "该证据对应英文成人样本，不构成本地常模，也不支持任何界值或百分位。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "maas15-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "maas15-en-v1",
    "audiences": {
      "respondent": {
        "numericScores": true,
        "references": false,
        "individualInterpretations": true,
        "scoreDerivedLabels": false,
        "resultQualityDetails": true,
        "rawAnswers": false,
        "itemScores": false,
        "methods": true,
        "educationalContent": false
      },
      "subject": {
        "numericScores": true,
        "references": false,
        "individualInterpretations": true,
        "scoreDerivedLabels": false,
        "resultQualityDetails": true,
        "rawAnswers": false,
        "itemScores": false,
        "methods": true,
        "educationalContent": false
      },
      "teacher": {
        "numericScores": true,
        "references": false,
        "individualInterpretations": true,
        "scoreDerivedLabels": false,
        "resultQualityDetails": true,
        "rawAnswers": false,
        "itemScores": false,
        "methods": true,
        "educationalContent": false
      },
      "researcher": {
        "numericScores": true,
        "references": false,
        "individualInterpretations": true,
        "scoreDerivedLabels": false,
        "resultQualityDetails": true,
        "rawAnswers": false,
        "itemScores": false,
        "methods": true,
        "educationalContent": false
      }
    },
    "unknownAudience": "DENY"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Mindful Attention Awareness Scale (MAAS), original 15-item version (“Day-to-Day Experiences” form)",
        "citation": "Brown, K. W., & Ryan, R. M. (2003). The benefits of being present: Mindfulness and its role in psychological well-being. Journal of Personality and Social Psychology, 84(4), 822–848. https://doi.org/10.1037/0022-3514.84.4.822",
        "url": "https://ppc.sas.upenn.edu/sites/default/files/mindfulnessscale.pdf",
        "publicationYear": 2003
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文与官方计分说明引自宾夕法尼亚大学积极心理学中心（PPC）公开托管的原版题本 PDF（题本标题 “Day-to-Day Experiences”）；PDF 与可访问的资源页均未附明确许可声明，本条目仅记录公开托管事实，不声称获得商业、翻译或再分发授权。PDF 未印期刊引文；标准出版记录登记为 Brown & Ryan (2003), JPSP 84(4), 822–848（DOI: 10.1037/0022-3514.84.4.822）。工作副本 SHA-256：75bf41d48f3915604f486d01fa2a38d2b6a5043ea04ad88b3b47aad9351264a9；全文提取与逐字核对见 docs/mindfulness-content-20261028/maas15/source.md 及 _prdata/pdfs/maas15_extract.txt。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "maas15_1_6",
          "options": [
            {
              "value": "1",
              "label": "Almost Always",
              "score": 1
            },
            {
              "value": "2",
              "label": "Very Frequently",
              "score": 2
            },
            {
              "value": "3",
              "label": "Somewhat Frequently",
              "score": 3
            },
            {
              "value": "4",
              "label": "Somewhat Infrequently",
              "score": 4
            },
            {
              "value": "5",
              "label": "Very Infrequently",
              "score": 5
            },
            {
              "value": "6",
              "label": "Almost Never",
              "score": 6
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "MAAS15_01",
          "content": "I could be experiencing some emotion and not be conscious of it until some time later.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_02",
          "content": "I break or spill things because of carelessness, not paying attention, or thinking of something else.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_03",
          "content": "I find it difficult to stay focused on what’s happening in the present.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_04",
          "content": "I tend to walk quickly to get where I’m going without paying attention to what I experience along the way.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_05",
          "content": "I tend not to notice feelings of physical tension or discomfort until they really grab my attention.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_06",
          "content": "I forget a person’s name almost as soon as I’ve been told it for the first time.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_07",
          "content": "It seems I am “running on automatic,” without much awareness of what I’m doing.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_08",
          "content": "I rush through activities without being really attentive to them.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_09",
          "content": "I get so focused on the goal I want to achieve that I lose touch with what I’m doing right now to get there.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_10",
          "content": "I do jobs or tasks automatically, without being aware of what I'm doing.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_11",
          "content": "I find myself listening to someone with one ear, doing something else at the same time.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_12",
          "content": "I drive places on ‘automatic pilot’ and then wonder why I went there.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_13",
          "content": "I find myself preoccupied with the future or the past.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_14",
          "content": "I find myself doing things without paying attention.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "MAAS15_15",
          "content": "I snack without being aware that I’m eating.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "maas15_1_6",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "MAAS15_01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "MAAS15_15",
            "transform": {
              "type": "identity"
            }
          }
        ],
        "defaultMissingPolicy": {
          "type": "complete_required"
        },
        "scores": [
          {
            "key": "dispositional_mindfulness",
            "type": "total",
            "label": "特质正念（单维均值）",
            "description": "官方计分为 15 题原始作答的均值（1–6）：全部题干为不留心式措辞且锚点 1=Almost Always → 6=Almost Never，均值越高表示不留心体验自报出现越少、日常留心越频繁；任一题缺答不计算。本条目不设任何反向变换（逐题极性核对见 docs/mindfulness-content-20261028/maas15/source.md）。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "MAAS15_01",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_02",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_03",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_04",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_05",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_06",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_07",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_08",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_09",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_10",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_11",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_12",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_13",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_14",
                  "weight": 1
                },
                {
                  "itemCode": "MAAS15_15",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "dispositional_mindfulness"
        ],
        "scoreOrder": [
          "dispositional_mindfulness"
        ],
        "interpretations": [
          {
            "scoreKey": "dispositional_mindfulness",
            "headline": "特质正念（单维均值）",
            "source": {
              "type": "score_only"
            },
            "summary": "这份问卷的 15 道英文原题描述的都是“到地方才想不起路上、一边听人一边想别的、吃完零食才回过神”这类不留心时刻，选项问的是它们出现的频繁程度。按官方规则直接取均值：均值越高，表示这类体验自报出现得越少、日常留心越频繁。人人都会走神，这再正常不过；发现“刚才在走神”的那一刻，恰恰就是觉察已经发生的时候。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近哪件日常小事（洗漱、走路、倒水），你经常做完才发现刚才在想别的？当时是什么把你带走的？"
              },
              {
                "category": "strategy",
                "text": "挑那件小事试一次“只做这一步”：留意水声、脚步或杯子的重量；走神了不用批评自己，温和地回到手头的动作就好。"
              }
            ]
          }
        ],
        "limitations": [
          "这是成人频次自评工具：结果整理的是作答者当前对自身体验的描述，不定义一个人认真与否、有能力与否，不能用于人格、能力或道德评价。",
          "英文自评受情境、心情与理解方式影响，只能作为回顾参考，不能代表所有时刻；结果不预测表现。",
          "原版验证为美国大学生与社区成人样本（Brown & Ryan, 2003），不构成中国或任何本地人群常模。",
          "任一题缺答均值不计算，缺答不会算最低分；完整作答要求是产品约定，不是原作者规则。",
          "没有常模、百分位或诊断阈值；分数不用于排名、选拔或高风险决策。",
          "State MAAS、MAAS-AANS 青少年版、5 题短版等派生版本的题本与计分不同，不与本条目混用；与 KIMS（kims39）、FFMQ（ffmq39/ffmq15）、CAMM（camm10）条目的题本、结构与证据互不通用，分数不互换比较。"
        ],
        "disclaimer": "供成人回顾个人体验与日常习惯，不是考试，也不能用于诊断、人格评判、排名或高风险决策。题本为英文原版。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-raw-one-is-min",
        "answers": [
          { "itemCode": "MAAS15_01", "responseValue": "1" },
          { "itemCode": "MAAS15_02", "responseValue": "1" },
          { "itemCode": "MAAS15_03", "responseValue": "1" },
          { "itemCode": "MAAS15_04", "responseValue": "1" },
          { "itemCode": "MAAS15_05", "responseValue": "1" },
          { "itemCode": "MAAS15_06", "responseValue": "1" },
          { "itemCode": "MAAS15_07", "responseValue": "1" },
          { "itemCode": "MAAS15_08", "responseValue": "1" },
          { "itemCode": "MAAS15_09", "responseValue": "1" },
          { "itemCode": "MAAS15_10", "responseValue": "1" },
          { "itemCode": "MAAS15_11", "responseValue": "1" },
          { "itemCode": "MAAS15_12", "responseValue": "1" },
          { "itemCode": "MAAS15_13", "responseValue": "1" },
          { "itemCode": "MAAS15_14", "responseValue": "1" },
          { "itemCode": "MAAS15_15", "responseValue": "1" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "dispositional_mindfulness": 1
          },
          "totalScoreKeys": [
            "dispositional_mindfulness"
          ]
        }
      },
      {
        "name": "all-raw-six-is-max",
        "answers": [
          { "itemCode": "MAAS15_01", "responseValue": "6" },
          { "itemCode": "MAAS15_02", "responseValue": "6" },
          { "itemCode": "MAAS15_03", "responseValue": "6" },
          { "itemCode": "MAAS15_04", "responseValue": "6" },
          { "itemCode": "MAAS15_05", "responseValue": "6" },
          { "itemCode": "MAAS15_06", "responseValue": "6" },
          { "itemCode": "MAAS15_07", "responseValue": "6" },
          { "itemCode": "MAAS15_08", "responseValue": "6" },
          { "itemCode": "MAAS15_09", "responseValue": "6" },
          { "itemCode": "MAAS15_10", "responseValue": "6" },
          { "itemCode": "MAAS15_11", "responseValue": "6" },
          { "itemCode": "MAAS15_12", "responseValue": "6" },
          { "itemCode": "MAAS15_13", "responseValue": "6" },
          { "itemCode": "MAAS15_14", "responseValue": "6" },
          { "itemCode": "MAAS15_15", "responseValue": "6" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "dispositional_mindfulness": 6
          },
          "totalScoreKeys": [
            "dispositional_mindfulness"
          ]
        }
      },
      {
        "name": "all-raw-midpoint",
        "answers": [
          { "itemCode": "MAAS15_01", "responseValue": "3" },
          { "itemCode": "MAAS15_02", "responseValue": "3" },
          { "itemCode": "MAAS15_03", "responseValue": "3" },
          { "itemCode": "MAAS15_04", "responseValue": "3" },
          { "itemCode": "MAAS15_05", "responseValue": "3" },
          { "itemCode": "MAAS15_06", "responseValue": "3" },
          { "itemCode": "MAAS15_07", "responseValue": "3" },
          { "itemCode": "MAAS15_08", "responseValue": "3" },
          { "itemCode": "MAAS15_09", "responseValue": "3" },
          { "itemCode": "MAAS15_10", "responseValue": "3" },
          { "itemCode": "MAAS15_11", "responseValue": "3" },
          { "itemCode": "MAAS15_12", "responseValue": "3" },
          { "itemCode": "MAAS15_13", "responseValue": "3" },
          { "itemCode": "MAAS15_14", "responseValue": "3" },
          { "itemCode": "MAAS15_15", "responseValue": "3" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "dispositional_mindfulness": 3
          },
          "totalScoreKeys": [
            "dispositional_mindfulness"
          ]
        }
      },
      {
        "name": "mixed-mean-3-2",
        "answers": [
          { "itemCode": "MAAS15_01", "responseValue": "3" },
          { "itemCode": "MAAS15_02", "responseValue": "3" },
          { "itemCode": "MAAS15_03", "responseValue": "3" },
          { "itemCode": "MAAS15_04", "responseValue": "3" },
          { "itemCode": "MAAS15_05", "responseValue": "3" },
          { "itemCode": "MAAS15_06", "responseValue": "3" },
          { "itemCode": "MAAS15_07", "responseValue": "3" },
          { "itemCode": "MAAS15_08", "responseValue": "3" },
          { "itemCode": "MAAS15_09", "responseValue": "3" },
          { "itemCode": "MAAS15_10", "responseValue": "3" },
          { "itemCode": "MAAS15_11", "responseValue": "3" },
          { "itemCode": "MAAS15_12", "responseValue": "3" },
          { "itemCode": "MAAS15_13", "responseValue": "3" },
          { "itemCode": "MAAS15_14", "responseValue": "3" },
          { "itemCode": "MAAS15_15", "responseValue": "6" }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "dispositional_mindfulness": 3.2
          },
          "totalScoreKeys": [
            "dispositional_mindfulness"
          ]
        }
      },
      {
        "name": "missing-item07",
        "answers": [
          { "itemCode": "MAAS15_01", "responseValue": "4" },
          { "itemCode": "MAAS15_02", "responseValue": "4" },
          { "itemCode": "MAAS15_03", "responseValue": "4" },
          { "itemCode": "MAAS15_04", "responseValue": "4" },
          { "itemCode": "MAAS15_05", "responseValue": "4" },
          { "itemCode": "MAAS15_06", "responseValue": "4" },
          { "itemCode": "MAAS15_08", "responseValue": "4" },
          { "itemCode": "MAAS15_09", "responseValue": "4" },
          { "itemCode": "MAAS15_10", "responseValue": "4" },
          { "itemCode": "MAAS15_11", "responseValue": "4" },
          { "itemCode": "MAAS15_12", "responseValue": "4" },
          { "itemCode": "MAAS15_13", "responseValue": "4" },
          { "itemCode": "MAAS15_14", "responseValue": "4" },
          { "itemCode": "MAAS15_15", "responseValue": "4" }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "dispositional_mindfulness": null
          },
          "totalScoreKeys": [
            "dispositional_mindfulness"
          ]
        }
      },
      {
        "name": "all-missing",
        "answers": [],
        "expected": {
          "quality": "invalid",
          "scores": {
            "dispositional_mindfulness": null
          },
          "totalScoreKeys": [
            "dispositional_mindfulness"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
