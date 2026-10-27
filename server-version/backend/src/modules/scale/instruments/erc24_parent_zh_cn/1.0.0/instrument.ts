import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Unvalidated working translation; item 12 is administered but not scored.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "erc24_parent_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Emotion Regulation Checklist — Parent Report",
      "abbreviation": "ERC-24",
      "instrumentFamily": "Emotion Regulation Checklist"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "SELF_REGULATION"
      ],
      "constructDefinition": "家长所观察的儿童情绪表达、调节以及情绪变化和负面反应。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:parent_report", "use:reflection", "use:research", "language_validation:chinese_working_translation", "license:translation_review_pending", "construct:sel_erc24_emotion_regulation", "construct:sel_erc24_lability_negativity", 
        "emotion_regulation",
        "lability_negativity",
        "parent_report"
      ]
    },
    "population": {
      "minAge": 6,
      "maxAge": 12,
      "respondentTypes": [
        "PARENT"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "原始研究为美国6–12岁儿童的辅导员报告；本版本为家长他评工作译稿，中文尚未验证。"
    },
    "administration": {
      "itemCount": 24,
      "estimatedMinutes": 7,
      "administrationModes": [
        "PAPER"
      ],
      "timeFrame": "通常观察到的频率；原材料存在不同施测说明版本",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "1–4频率选项；分量表方向不同。",
        "第12题保留但不计入原始两个分量表；预计时间为产品估计。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原研究及跨文化研究不等同于本中文工作译稿验证。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "只反映观察者视角，不能代替孩子自述。"
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
        "evidenceId": "shields-cicchetti-1997",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US school-age children, counselor reports",
        "locale": "en",
        "territory": "US",
        "sampleSize": 143,
        "studyDesign": "Original study derived two factors; item 12 was excluded from both factors.",
        "rating": "MIXED",
        "citation": "Shields A, Cicchetti D. (1997). Emotion regulation among school-age children: The development and validation of a new criterion Q-sort scale. Developmental Psychology, 33(6), 906–916.",
        "doi": "10.1037/0012-1649.33.6.906",
        "url": "https://doi.org/10.1037/0012-1649.33.6.906",
        "notes": "Later studies report factor-structure variation across contexts, ages and informants; not local Chinese validation."
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "erc24-parent-v1",
    "respondentTypes": [
      "PARENT"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "erc24-parent-v1",
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
    "contentLocale": "zh-CN",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "parent_report",
      "source": {
        "title": "Emotion Regulation Checklist",
        "citation": "Shields A, Cicchetti D. (1997). Emotion regulation among school-age children: The development and validation of a new criterion Q-sort scale. Developmental Psychology, 33(6), 906–916.",
        "url": "https://doi.org/10.1037/0012-1649.33.6.906",
        "publicationYear": 1997
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "未确认本工具在项目中的翻译和数字分发许可；本中文内容为未验证工作译稿。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "erc_frequency_1_4",
          "options": [
            {
              "value": "1",
              "label": "很少或从不",
              "score": 1
            },
            {
              "value": "2",
              "label": "有时",
              "score": 2
            },
            {
              "value": "3",
              "label": "经常",
              "score": 3
            },
            {
              "value": "4",
              "label": "几乎总是",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "ERC-01",
          "content": "这个孩子性格开朗。",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-02",
          "content": "这个孩子的情绪变化幅度很大（情绪状态难以预料，因为他或她会很快从积极的心情转为消极的心情）。",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-03",
          "content": "面对成年人中性或友好的接近，这个孩子会积极回应。",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-04",
          "content": "这个孩子能顺利从一项活动转到另一项活动；转换活动时不会变得焦虑、生气、痛苦或过度兴奋。",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-05",
          "content": "这个孩子能从心烦或痛苦中较快恢复（例如，在令人难受的事件后，不会一直噘嘴、闷闷不乐、焦虑或难过）。",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-06",
          "content": "这个孩子容易感到沮丧。",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-07",
          "content": "面对同伴中性或友好的接近，这个孩子会积极回应。",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-08",
          "content": "这个孩子容易发怒或大发脾气。",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-09",
          "content": "这个孩子能够延迟满足。",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-10",
          "content": "这个孩子会从他人的痛苦中获得乐趣（例如，别人受伤或受罚时会笑，或喜欢取笑别人）。",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-11",
          "content": "这个孩子能在令人激动的情境中调节兴奋程度（例如，在精力旺盛的游戏中不会过于忘形，或在不适当的情境中过度兴奋）。",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-12",
          "content": "这个孩子在成年人面前会哭闹或黏人。",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-13",
          "content": "这个孩子容易突然表现出干扰他人的旺盛精力和兴奋。",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-14",
          "content": "成年人设定限制时，这个孩子会生气地回应。",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-15",
          "content": "这个孩子能够说出自己感到难过、生气或害怕。",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-16",
          "content": "这个孩子看起来难过或无精打采。",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-17",
          "content": "这个孩子试图邀请别人一起玩时会过度兴奋。",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-18",
          "content": "这个孩子表现出情感平淡（表情空洞或缺乏表现，似乎在情感上缺席）。",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-19",
          "content": "面对同伴中性或友好的接近，这个孩子会作出消极回应（例如，以愤怒的语气说话或表现出害怕）。",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-20",
          "content": "这个孩子很冲动。",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-21",
          "content": "这个孩子对他人有同理心；别人心烦或痛苦时会表现出关心。",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-22",
          "content": "这个孩子表现出的兴奋和旺盛精力让别人觉得受到打扰或干扰。",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-23",
          "content": "面对同伴敌意、攻击性或侵扰性的行为，这个孩子会表现出适当的负面情绪（生气、害怕、沮丧或痛苦）。",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "ERC-24",
          "content": "这个孩子试图邀请别人一起玩时会表现出负面情绪。",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "erc_frequency_1_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "ERC-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-04",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERC-05",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERC-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-09",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERC-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-11",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERC-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-16",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERC-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-18",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "ERC-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "ERC-24",
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
            "key": "emotion_regulation",
            "type": "dimension",
            "label": "情绪表达与调节",
            "description": "8题总和，较高分表示观察到更多该维度所列的表达与调节行为。",
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
                  "itemCode": "ERC-01",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-03",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-07",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-15",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-16",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-18",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-21",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-23",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "lability_negativity",
            "type": "dimension",
            "label": "情绪变化与负面反应",
            "description": "15题总和，较高分表示观察到更多该维度所列的情绪变化与负面反应。",
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
                  "itemCode": "ERC-02",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-04",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-05",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-06",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-08",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-09",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-10",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-11",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-13",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-14",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-17",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-19",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-20",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-22",
                  "weight": 1
                },
                {
                  "itemCode": "ERC-24",
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
          "emotion_regulation",
          "lability_negativity"
        ],
        "scoreOrder": [
          "emotion_regulation",
          "lability_negativity"
        ],
        "interpretations": [
          {
            "scoreKey": "emotion_regulation",
            "headline": "情绪表达与调节",
            "source": {
              "type": "score_only"
            },
            "summary": "这部分记录您看到孩子表达感受、回应他人以及关心他人的一些方式。数字只来自您的观察，还要结合孩子的处境和自己的表达来理解。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "孩子在什么人或情境中比较容易说出感受？您是否注意到不一样的表达方式？"
              },
              {
                "category": "strategy",
                "text": "在平静的时候邀请孩子说说感受，也可以让孩子选择用画画、写字或其他方式表达。"
              }
            ]
          },
          {
            "scoreKey": "lability_negativity",
            "headline": "情绪变化与负面反应",
            "source": {
              "type": "score_only"
            },
            "summary": "这部分记录您看到的情绪变化、受挫反应和行为。数字越大表示此类描述在回答中越常出现，不代表孩子的性格或诊断。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "哪些情境下孩子更容易感到困难？当时任务、环境和支持有什么不同？"
              },
              {
                "category": "strategy",
                "text": "先观察触发情境，帮孩子暂停并给予陪伴；等平静后再一起想下一步。"
              }
            ]
          }
        ],
        "limitations": [
          "这是家长在特定情境下的观察，不等于孩子自己的感受或完整能力。",
          "情绪表达与调节及情绪变化与负面反应的方向不同，不能混成一个总分。",
          "中文工作译稿尚未回译或本地验证；原研究不构成中文人群常模。",
          "每维完整才计算是产品约定，题12不进入两个分量表。"
        ],
        "disclaimer": "用于交流和反思，不用于诊断、筛查、选拔或排名。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "minimum-keyed",
        "answers": [
          {
            "itemCode": "ERC-01",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-02",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-03",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-04",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-05",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-06",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-07",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-08",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-09",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-10",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-11",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-12",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-13",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-14",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-15",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-16",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-17",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-18",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-19",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-20",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-21",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-22",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-23",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-24",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotion_regulation": 8,
            "lability_negativity": 15
          },
          "totalScoreKeys": [
            "emotion_regulation",
            "lability_negativity"
          ]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          {
            "itemCode": "ERC-01",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-02",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-03",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-04",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-05",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-06",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-07",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-08",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-09",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-10",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-11",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-12",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-13",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-14",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-15",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-16",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-17",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-18",
            "responseValue": "1"
          },
          {
            "itemCode": "ERC-19",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-20",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-21",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-22",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-23",
            "responseValue": "4"
          },
          {
            "itemCode": "ERC-24",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotion_regulation": 32,
            "lability_negativity": 60
          },
          "totalScoreKeys": [
            "emotion_regulation",
            "lability_negativity"
          ]
        }
      },
      {
        "name": "missing-unscored-item",
        "answers": [
          {
            "itemCode": "ERC-01",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-02",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-03",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-04",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-05",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-06",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-07",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-08",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-09",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-10",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-11",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-13",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-14",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-15",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-16",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-17",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-18",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-19",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-20",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-21",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-22",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-23",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-24",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "emotion_regulation": 18,
            "lability_negativity": 34
          },
          "totalScoreKeys": [
            "emotion_regulation",
            "lability_negativity"
          ]
        }
      },
      {
        "name": "missing-regulation-item",
        "answers": [
          {
            "itemCode": "ERC-02",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-03",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-04",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-05",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-06",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-07",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-08",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-09",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-10",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-11",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-12",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-13",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-14",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-15",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-16",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-17",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-18",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-19",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-20",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-21",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-22",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-23",
            "responseValue": "2"
          },
          {
            "itemCode": "ERC-24",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "emotion_regulation": null,
            "lability_negativity": 34
          },
          "totalScoreKeys": [
            "emotion_regulation",
            "lability_negativity"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
