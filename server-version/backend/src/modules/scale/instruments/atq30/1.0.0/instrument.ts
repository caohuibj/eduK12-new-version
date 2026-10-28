import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text transcribed from the publicly posted ATQ/ATQ-B form (Hollon & Kendall, 1980); license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "atq30",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Automatic Thoughts Questionnaire, 30-item frequency version",
      "abbreviation": "ATQ",
      "instrumentFamily": "Automatic Thoughts Questionnaire"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "自评近一周消极自动思维（针对自我的负面念头）出现的频率。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:cbt",
        "construct:cbt_atq_negative_automatic_thoughts",
        "automatic_thoughts",
        "cognitive_behavioral_mechanism",
        "adult_self_report",
        "self_report",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "license:license_unverified"
      ]
    },
    "population": {
      "populationNotes": "原版开发与验证样本为美国大学生及成人临床对照样本；未建立儿童青少年常模。K12学生施测前须评估年龄适配性（儿童青少年版 CATS 尚未入库）。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 30,
      "estimatedMinutes": 10,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "过去一周",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原30题顺序与五点频率选项。",
        "本实现仅计频率列；第三方资料的ATQ-B版本另有“想法可信度”列，未实现。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版在大学生与抑郁-非抑郁对照样本中区分良好。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "频率反馈不构成抑郁诊断或治疗建议。"
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
        "evidenceId": "hollon-kendall-atq-1980",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US college students; depressed vs nondepressed adult comparisons",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development with internal consistency and discrimination between depressed and nondepressed groups.",
        "rating": "SUFFICIENT",
        "citation": "Hollon SD, Kendall PC. (1980). Cognitive self-statements in depression: Development of an Automatic Thoughts Questionnaire. Cognitive Therapy and Research, 4(4), 383–395.",
        "url": "https://dradamvolungis.com/wp-content/uploads/2020/06/automatic-thoughts-questionnaire.pdf",
        "notes": "来源文档报告α=.97；无本地常模，无临床界值。题文转录自第三方公开教学资料，正式采用前须与原版核对。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "atq30-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "atq30-en-v1",
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
  "instruction": {
    "schemaVersion": 1,
    "text": "Listed below are a variety of thoughts that pop into people's heads. Please read each thought and indicate how frequently, if at all, the thought occurred to you over the last week. Please read each item carefully and circle the appropriate answers on the answer sheet in the following fashion (1 = \"not at all\", 2 = \"sometimes\", 3 = \"moderately often\", 4 = \"often\", and 5 = \"all the time\").",
    "language": "en",
    "version": "1.0.0",
    "source": "第三方转录题本ATQ-B频率列前导语；信念度列未实现。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Automatic Thoughts Questionnaire (ATQ), 30-item frequency version",
        "citation": "Hollon SD, Kendall PC. (1980). Cognitive self-statements in depression: Development of an Automatic Thoughts Questionnaire. Cognitive Therapy and Research, 4(4), 383–395.",
        "url": "https://dradamvolungis.com/wp-content/uploads/2020/06/automatic-thoughts-questionnaire.pdf",
        "publicationYear": 1980
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文转录自第三方公开教学网站（dradamvolungis.com）发布的题本，原作者为 Hollon & Kendall (1980)；该资料未声明再分发条款。未取得作者或出版方授权，不声称商业、翻译或再分发授权；正式发布前须与原版核对并确认权利。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "atq_frequency_1_5",
          "options": [
            {
              "value": "1",
              "label": "not at all",
              "score": 1
            },
            {
              "value": "2",
              "label": "sometimes",
              "score": 2
            },
            {
              "value": "3",
              "label": "moderately often",
              "score": 3
            },
            {
              "value": "4",
              "label": "often",
              "score": 4
            },
            {
              "value": "5",
              "label": "all the time",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "ATQ-01",
          "content": "I feel like I'm up against the world",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-02",
          "content": "I'm no good.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-03",
          "content": "Why can't I ever succeed?",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-04",
          "content": "No one understands me.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-05",
          "content": "I've let people down.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-06",
          "content": "I don't think I can go on.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-07",
          "content": "I wish I were a better person",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-08",
          "content": "I'm so weak.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-09",
          "content": "My life's not going the way I want it to.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-10",
          "content": "I'm so disappointed in myself.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-11",
          "content": "Nothing feels good anymore.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-12",
          "content": "I can't stand this anymore.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-13",
          "content": "I can't get started.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-14",
          "content": "What's wrong with me?",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-15",
          "content": "I wish I were somewhere else",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-16",
          "content": "I can't get things together.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-17",
          "content": "I hate myself.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-18",
          "content": "I'm worthless.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-19",
          "content": "Wish I could just disappear.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-20",
          "content": "What's the matter with me?",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-21",
          "content": "I'm a loser.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-22",
          "content": "My life is a mess.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-23",
          "content": "I'm a failure.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-24",
          "content": "I'll never make it.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-25",
          "content": "I feel so helpless.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-26",
          "content": "Something has to change",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-27",
          "content": "There must be something wrong with me.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-28",
          "content": "My future is bleak.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-29",
          "content": "It's just not worth it.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "ATQ-30",
          "content": "I can't finish anything.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "atq_frequency_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "ATQ-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ATQ-30",
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
            "key": "pmdc",
            "type": "dimension",
            "label": "个人调适不良与改变愿望",
            "description": "相关题作答直接求和（无反向题）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "ATQ-07",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-10",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-14",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-20",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-26",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "nsne",
            "type": "dimension",
            "label": "消极自我概念与消极期待",
            "description": "相关题作答直接求和（无反向题）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "ATQ-02",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-03",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-09",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-21",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-23",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-24",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-28",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "lse",
            "type": "dimension",
            "label": "低自尊",
            "description": "相关题作答直接求和（无反向题）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "ATQ-17",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-18",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "helplessness",
            "type": "dimension",
            "label": "无助感",
            "description": "相关题作答直接求和（无反向题）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "ATQ-29",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-30",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "total",
            "type": "total",
            "label": "全部30题总和",
            "description": "相关题作答直接求和（无反向题）；必须完整作答。",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "ATQ-01",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-02",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-03",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-04",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-05",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-06",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-07",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-08",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-09",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-10",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-11",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-12",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-13",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-14",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-15",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-16",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-17",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-18",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-19",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-20",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-21",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-22",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-23",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-24",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-25",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-26",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-27",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-28",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-29",
                  "weight": 1
                },
                {
                  "itemCode": "ATQ-30",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "total"
        ],
        "scoreOrder": [
          "pmdc",
          "nsne",
          "lse",
          "helplessness",
          "total"
        ],
        "interpretations": [
          {
            "scoreKey": "total",
            "headline": "这周脑中闪过的念头",
            "source": {
              "type": "score_only"
            },
            "summary": "这份记录统计的是近一周30句消极自动思维出现的频率。念头出现得多，不等于它们是真的，也不等于你出了问题；频率本身会随压力和睡眠波动。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回看这一周，哪类情境最容易触发这类念头（比如被批评、考试、独处）？"
              },
              {
                "category": "strategy",
                "text": "把其中一句念头写下来，试着在旁边写下“如果朋友这样想，我会对他说什么”。"
              }
            ]
          },
          {
            "scoreKey": "pmdc",
            "headline": "想改变的急迫",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题反映“想摆脱现状、希望一切不同”的念头频率。想改变是行动的起点；但“必须马上全部改变”的紧迫感本身会加重疲惫。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "如果改变只能从一件小事开始，你会选哪一件？"
              },
              {
                "category": "strategy",
                "text": "把“我必须……”改写成“我可以先……”，选一个本周能做到的最小步骤。"
              }
            ]
          },
          {
            "scoreKey": "nsne",
            "headline": "对自己的负面预期",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题统计“我不行、不会成功”一类对自我的消极判断出现的频率。预期不等于事实；它们更像过去经历的回声，而非对未来的准确预测。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "这些预期里，有没有一条与最近发生的具体事实不符？"
              },
              {
                "category": "strategy",
                "text": "为一条消极预期找一个“反例记录”：过去一次与它相反的真实经历，写在手机备忘里。"
              }
            ]
          },
          {
            "scoreKey": "lse",
            "headline": "对自己的评价",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注自我批评、自我贬低的念头。评价性的话听起来像事实，其实是一种视角；它可以在被注意到之后松动。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "你对自己说这些话时，用的语气和对朋友的一样吗？"
              },
              {
                "category": "strategy",
                "text": "下次自我批评的念头出现时，试着把它换成你会对好朋友使用的同一句话。"
              }
            ]
          },
          {
            "scoreKey": "helplessness",
            "headline": "无力感",
            "source": {
              "type": "score_only"
            },
            "summary": "这两题统计“做什么都没用、坚持不下去”一类念头。无力感是一种可以被理解的状态，不是性格缺陷；它通常在支持和支持性行动之后减轻。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "过去一个月里，有没有一件“很小的事”其实完成了？"
              },
              {
                "category": "strategy",
                "text": "告诉一位信任的人你最近的感受；如果这些念头持续加重，请考虑联系专业心理支持。"
              }
            ]
          }
        ],
        "limitations": [
          "分数反映“念头出现的频率”，不代表念头为真，也不代表个人品质。",
          "原验证样本为美国大学生与成人；不构成儿童青少年常模。",
          "没有常模、百分位或临床界值；分数不能用于抑郁诊断或疗效判定。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。",
          "题文转录自第三方资料，发布前须与原版逐题核对。"
        ],
        "disclaimer": "仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。若消极念头持续加重或出现伤害自己的念头，请及时联系可信任的人或专业心理支持。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-keyed-min",
        "answers": [
          {
            "itemCode": "ATQ-01",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-02",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-03",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-04",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-05",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-06",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-07",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-08",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-09",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-10",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-11",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-12",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-13",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-14",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-15",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-16",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-17",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-18",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-19",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-20",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-21",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-22",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-23",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-24",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-25",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-26",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-27",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-28",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-29",
            "responseValue": "1"
          },
          {
            "itemCode": "ATQ-30",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "pmdc": 5,
            "nsne": 7,
            "lse": 2,
            "helplessness": 2,
            "total": 30
          },
          "totalScoreKeys": [
            "pmdc",
            "nsne",
            "lse",
            "helplessness",
            "total"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "ATQ-01",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-02",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-03",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-04",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-05",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-06",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-07",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-08",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-09",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-10",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-11",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-12",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-13",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-14",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-15",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-16",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-17",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-18",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-19",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-20",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-21",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-22",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-23",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-24",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-25",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-26",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-27",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-28",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-29",
            "responseValue": "5"
          },
          {
            "itemCode": "ATQ-30",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "pmdc": 25,
            "nsne": 35,
            "lse": 10,
            "helplessness": 10,
            "total": 150
          },
          "totalScoreKeys": [
            "pmdc",
            "nsne",
            "lse",
            "helplessness",
            "total"
          ]
        }
      },
      {
        "name": "sample-nsne4-rest2",
        "answers": [
          {
            "itemCode": "ATQ-01",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-02",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-03",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-04",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-05",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-06",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-07",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-08",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-09",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-10",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-11",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-12",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-13",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-14",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-15",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-16",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-17",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-18",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-19",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-20",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-21",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-22",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-23",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-24",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-25",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-26",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-27",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-28",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-29",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-30",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "pmdc": 10,
            "nsne": 28,
            "lse": 4,
            "helplessness": 4,
            "total": 74
          },
          "totalScoreKeys": [
            "pmdc",
            "nsne",
            "lse",
            "helplessness",
            "total"
          ]
        }
      },
      {
        "name": "missing-total",
        "answers": [
          {
            "itemCode": "ATQ-01",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-02",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-03",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-04",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-05",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-06",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-08",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-09",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-10",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-11",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-12",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-13",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-14",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-15",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-16",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-17",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-18",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-19",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-20",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-21",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-22",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-23",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-24",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-25",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-26",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-27",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-28",
            "responseValue": "4"
          },
          {
            "itemCode": "ATQ-29",
            "responseValue": "2"
          },
          {
            "itemCode": "ATQ-30",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "pmdc": null,
            "nsne": 28,
            "lse": 4,
            "helplessness": 4,
            "total": null
          },
          "totalScoreKeys": [
            "pmdc",
            "nsne",
            "lse",
            "helplessness",
            "total"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
