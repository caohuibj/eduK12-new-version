import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Working translation, not independently back-translated or validated.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "eaq30_rieffe_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Emotion Awareness Questionnaire Revised, 30-item",
      "abbreviation": "EAQ30",
      "instrumentFamily": "Emotion Awareness Questionnaire"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "儿童青少年如何辨认、分享、隐藏和思考自己及他人的情绪，以及是否报告情绪相关的身体线索。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:student_self", "use:reflection", "use:research", "language_validation:chinese_working_translation", "license:translation_review_pending", "construct:sel_eaq30_differentiating", "construct:sel_eaq30_verbal_sharing", "construct:sel_eaq30_not_hiding", "construct:sel_eaq30_bodily_unawareness", "construct:sel_eaq30_attending_to_others", "construct:sel_eaq30_analysing_own", 
        "emotion_awareness",
        "emotion_differentiation",
        "emotion_expression",
        "bodily_signals",
        "self_report"
      ]
    },
    "population": {
      "populationNotes": "2008年荷兰儿童和青少年样本；此中文工作译稿未经独立回译或本地验证。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 30,
      "estimatedMinutes": 8,
      "administrationModes": [
        "PAPER"
      ],
      "timeFrame": "通常情形，无指定回忆期",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "预计时长是产品估计；顺序与英国版题本一致。",
        "保持三档与六维原计分；身体维度方向不同。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原文研究支持；中文工作译文尚未验证。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "作者明确没有个体分数解释的信息；反馈仅作普遍反思。"
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
        "evidenceId": "rieffe-2008",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Dutch primary and secondary school children and young adolescents",
        "locale": "nl",
        "territory": "NL",
        "sampleSize": 665,
        "studyDesign": "Revision and six-factor analysis of 30 items; 41 of 706 excluded for more than six missing values.",
        "rating": "MIXED",
        "citation": "Rieffe C, Oosterveld P, Miers AC, Meerum Terwogt M, Ly V. (2008). Emotion awareness and internalising symptoms in children and adolescents: The Emotion Awareness Questionnaire revised. Personality and Individual Differences, 45, 756–761.",
        "doi": "10.1016/j.paid.2008.08.001",
        "url": "https://doi.org/10.1016/j.paid.2008.08.001",
        "notes": "Original paper reports most items loaded on their keyed factors, with one exception. This is not evidence for this Chinese working translation."
      }
    ],
    "referenceApplicability": []
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "zh-CN",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Emotion Awareness Questionnaire Revised (EAQ30)",
        "citation": "Rieffe C, Oosterveld P, Miers AC, Meerum Terwogt M, Ly V. (2008). Emotion awareness and internalising symptoms in children and adolescents: The Emotion Awareness Questionnaire revised. Personality and Individual Differences, 45, 756–761.",
        "url": "https://www.focusonemotions.nl/instruments/emotion-awareness-questionnaire-eaq",
        "publicationYear": 2008
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "作者站欢迎使用并允许翻译，列出回译和审阅步骤；本译稿尚未完成这些步骤。数字化及分发范围未明。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "eaq_truth_1_3",
          "options": [
            {
              "value": "1",
              "label": "不符合",
              "score": 1
            },
            {
              "value": "2",
              "label": "有时符合",
              "score": 2
            },
            {
              "value": "3",
              "label": "符合",
              "score": 3
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "EAQ-01",
          "content": "我常常对自己的感受感到困惑。",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-02",
          "content": "我觉得很难向朋友解释我的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-03",
          "content": "别人不需要知道我的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-04",
          "content": "当我害怕或紧张时，肚子里会有一些感觉。",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-05",
          "content": "知道朋友的感受很重要。",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-06",
          "content": "当我生气或心烦时，我会试着弄明白为什么。",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-07",
          "content": "我很难知道自己是难过、生气，还是有别的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-08",
          "content": "我觉得很难和任何人谈论自己的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-09",
          "content": "当我因为某件事心烦时，我常常把感受留在心里。",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-10",
          "content": "当我心烦时，我的身体也能感觉到。",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-11",
          "content": "我不想知道朋友的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-12",
          "content": "我的感受帮助我理解发生了什么。",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-13",
          "content": "我从来不能确切地知道自己有什么感受。",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-14",
          "content": "我可以很容易地向朋友解释我内心的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-15",
          "content": "当我生气或心烦时，我会试着把这些感受藏起来。",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-16",
          "content": "当我害怕或紧张时，身体没有任何感觉。",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-17",
          "content": "如果朋友心烦，我会试着理解原因。",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-18",
          "content": "当我遇到问题时，知道自己对它的感受会对我有帮助。",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-19",
          "content": "当我心烦时，我不知道自己是难过、害怕还是生气。",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-20",
          "content": "当我心烦时，我尽量不表现出来。",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-21",
          "content": "当我因为某件事心烦时，身体会有不一样的感觉。",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-22",
          "content": "我不在乎朋友内心的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-23",
          "content": "了解自己的感受很重要。",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-24",
          "content": "有时我感到心烦，却完全不知道为什么。",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-25",
          "content": "当我感觉不好时，这不关其他人的事。",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-26",
          "content": "当我难过时，我的身体会感到无力。",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-27",
          "content": "我通常知道朋友的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-28",
          "content": "我总想知道为什么一件事让我感觉不好。",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-29",
          "content": "我常常不知道自己为什么生气。",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        },
        {
          "itemCode": "EAQ-30",
          "content": "我不知道一件事会不会让我心烦。",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "eaq_truth_1_3",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "EAQ-01",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-02",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-03",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-04",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-07",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-08",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-09",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-10",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-11",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-13",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-15",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-19",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-20",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-21",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-22",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-24",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-25",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-26",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "EAQ-29",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "EAQ-30",
            "transform": {
              "type": "reverse"
            }
          }
        ],
        "defaultMissingPolicy": {
          "type": "complete_required"
        },
        "scores": [
          {
            "key": "differentiating",
            "type": "dimension",
            "label": "分辨自己的情绪",
            "description": "反向计分后的题目均值，反映这一方面的回答。",
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
                  "itemCode": "EAQ-01",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-07",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-13",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-19",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-24",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-29",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-30",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "verbal_sharing",
            "type": "dimension",
            "label": "用语言分享感受",
            "description": "反向计分后的题目均值，反映这一方面的回答。",
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
                  "itemCode": "EAQ-02",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-08",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-14",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "not_hiding",
            "type": "dimension",
            "label": "不隐藏情绪",
            "description": "反向计分后的题目均值，反映这一方面的回答。",
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
                  "itemCode": "EAQ-03",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-09",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-15",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-20",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-25",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "bodily_unawareness",
            "type": "dimension",
            "label": "较少觉察身体信号",
            "description": "分数越大表示较少报告身体线索。",
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
                  "itemCode": "EAQ-04",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-10",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-16",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-21",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-26",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "attending_to_others",
            "type": "dimension",
            "label": "关注他人的情绪",
            "description": "反向计分后的题目均值，反映这一方面的回答。",
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
                  "itemCode": "EAQ-05",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-11",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-17",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-22",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-27",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "analysing_own",
            "type": "dimension",
            "label": "思考自己的情绪",
            "description": "反向计分后的题目均值，反映这一方面的回答。",
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
                  "itemCode": "EAQ-06",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-12",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-18",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-23",
                  "weight": 1
                },
                {
                  "itemCode": "EAQ-28",
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
          "differentiating",
          "verbal_sharing",
          "not_hiding",
          "bodily_unawareness",
          "attending_to_others",
          "analysing_own"
        ],
        "scoreOrder": [
          "differentiating",
          "verbal_sharing",
          "not_hiding",
          "bodily_unawareness",
          "attending_to_others",
          "analysing_own"
        ],
        "interpretations": [
          {
            "scoreKey": "differentiating",
            "headline": "分辨情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "有时一种感觉里会混着好几种情绪，慢一点命名也没关系。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想最近一次心情复杂的时候，你能找到哪些不同的感受？"
              },
              {
                "category": "strategy",
                "text": "选一个时刻，试着用两个情绪词描述自己，不必急着找到唯一答案。"
              }
            ]
          },
          {
            "scoreKey": "verbal_sharing",
            "headline": "用语言分享感受",
            "source": {
              "type": "score_only"
            },
            "summary": "有时说出感受并不容易；你可以选择合适的人、时间和分享程度。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "谁让你感到被认真倾听？你更愿意用说、写还是画的方式表达？"
              },
              {
                "category": "strategy",
                "text": "如果愿意，向信任的人说一句“我现在有点……”，也可以先写下来。"
              }
            ]
          },
          {
            "scoreKey": "not_hiding",
            "headline": "不隐藏情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "是否表达情绪会受到场合、关系与安全感影响；保留隐私也是你的选择。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "什么时候你觉得表达感受比较自在？什么时候你希望先保留给自己？"
              },
              {
                "category": "strategy",
                "text": "想分享时，先选一位信任的人，并说清楚你希望被倾听还是得到建议。"
              }
            ]
          },
          {
            "scoreKey": "bodily_unawareness",
            "headline": "身体里的线索",
            "source": {
              "type": "score_only"
            },
            "summary": "心情有时会伴随身体变化，每个人感受到的方式和强度都不同。这里数字越大，表示回答中较少报告这些身体线索；它不是健康或能力好坏的判断。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "紧张、难过或者开心时，你的身体有什么变化？没有明显变化也可以。"
              },
              {
                "category": "strategy",
                "text": "找一个舒服的时刻，留意呼吸、肩膀或肚子，感到不舒服时可以停下。"
              }
            ]
          },
          {
            "scoreKey": "attending_to_others",
            "headline": "关注别人的感受",
            "source": {
              "type": "score_only"
            },
            "summary": "别人的表情或话语可能提供线索，但猜测不一定准确。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "当朋友心情不好时，你通常怎样发现？你希望怎样确认自己的理解？"
              },
              {
                "category": "strategy",
                "text": "如果对方愿意，可以问“你现在感觉怎么样？需要我陪你吗？”"
              }
            ]
          },
          {
            "scoreKey": "analysing_own",
            "headline": "想一想自己的情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "回头看看情绪与发生的事之间有什么联系，可以帮助你理解自己。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次情绪变化前发生了什么？当时你有什么需要？"
              },
              {
                "category": "strategy",
                "text": "试着记下“发生了……我感觉……我需要……”，不知道的部分可以留空。"
              }
            ]
          }
        ],
        "limitations": [
          "这是未经回译及本地验证的中文工作译稿，结果不可视作已验证中文测量结果。",
          "作者表示没有常模、界值或个体分数解释信息；数字不是等级，不能用作筛查。",
          "身体维度按作者计分语法方向为较少报告身体线索，其余维度应各自理解。",
          "该报告是单次自述，缺失维度不计分。"
        ],
        "disclaimer": "这些内容仅供一般自我反思，不用于诊断、筛查、选拔或排名。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-midpoint",
        "answers": [
          {
            "itemCode": "EAQ-01",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-02",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-03",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-04",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-05",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-06",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-07",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-08",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-09",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-10",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-11",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-12",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-13",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-14",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-15",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-16",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-17",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-18",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-19",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-20",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-21",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-22",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-23",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-24",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-25",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-26",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-27",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-28",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-29",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-30",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "differentiating": 2,
            "verbal_sharing": 2,
            "not_hiding": 2,
            "bodily_unawareness": 2,
            "attending_to_others": 2,
            "analysing_own": 2
          },
          "totalScoreKeys": [
            "differentiating",
            "verbal_sharing",
            "not_hiding",
            "bodily_unawareness",
            "attending_to_others",
            "analysing_own"
          ]
        }
      },
      {
        "name": "all-keyed-maximum",
        "answers": [
          {
            "itemCode": "EAQ-01",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-02",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-03",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-04",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-05",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-06",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-07",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-08",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-09",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-10",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-11",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-12",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-13",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-14",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-15",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-16",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-17",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-18",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-19",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-20",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-21",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-22",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-23",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-24",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-25",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-26",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-27",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-28",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-29",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-30",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "differentiating": 3,
            "verbal_sharing": 3,
            "not_hiding": 3,
            "bodily_unawareness": 3,
            "attending_to_others": 3,
            "analysing_own": 3
          },
          "totalScoreKeys": [
            "differentiating",
            "verbal_sharing",
            "not_hiding",
            "bodily_unawareness",
            "attending_to_others",
            "analysing_own"
          ]
        }
      },
      {
        "name": "all-keyed-minimum",
        "answers": [
          {
            "itemCode": "EAQ-01",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-02",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-03",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-04",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-05",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-06",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-07",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-08",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-09",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-10",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-11",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-12",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-13",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-14",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-15",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-16",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-17",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-18",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-19",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-20",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-21",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-22",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-23",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-24",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-25",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-26",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-27",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-28",
            "responseValue": "1"
          },
          {
            "itemCode": "EAQ-29",
            "responseValue": "3"
          },
          {
            "itemCode": "EAQ-30",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "differentiating": 1,
            "verbal_sharing": 1,
            "not_hiding": 1,
            "bodily_unawareness": 1,
            "attending_to_others": 1,
            "analysing_own": 1
          },
          "totalScoreKeys": [
            "differentiating",
            "verbal_sharing",
            "not_hiding",
            "bodily_unawareness",
            "attending_to_others",
            "analysing_own"
          ]
        }
      },
      {
        "name": "missing-differentiation-item",
        "answers": [
          {
            "itemCode": "EAQ-02",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-03",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-04",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-05",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-06",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-07",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-08",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-09",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-10",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-11",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-12",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-13",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-14",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-15",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-16",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-17",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-18",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-19",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-20",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-21",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-22",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-23",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-24",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-25",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-26",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-27",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-28",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-29",
            "responseValue": "2"
          },
          {
            "itemCode": "EAQ-30",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "differentiating": null,
            "verbal_sharing": 2,
            "not_hiding": 2,
            "bodily_unawareness": 2,
            "attending_to_others": 2,
            "analysing_own": 2
          },
          "totalScoreKeys": [
            "differentiating",
            "verbal_sharing",
            "not_hiding",
            "bodily_unawareness",
            "attending_to_others",
            "analysing_own"
          ]
        }
      }
    ]
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "eaq30-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "eaq30-v1",
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
  }
} satisfies ScaleInstrumentSourceV1
