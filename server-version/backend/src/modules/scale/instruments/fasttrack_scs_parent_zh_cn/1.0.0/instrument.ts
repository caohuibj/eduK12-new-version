import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Unvalidated working translation. The observer and instrument form are explicit.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "fasttrack_scs_parent_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Social Competence Scale — Parent Version",
      "abbreviation": "SCS-SCP",
      "instrumentFamily": "Fast Track Social Competence Scale"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "家长观察的儿童亲社会沟通和情绪调节。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:parent_report", "use:reflection", "use:research", "language_validation:chinese_working_translation", "license:translation_review_pending", "construct:sel_fasttrack_scs_prosocial", "construct:sel_fasttrack_scs_regulation", 
        "social_competence",
        "prosocial",
        "emotional_regulation",
        "parent_report"
      ]
    },
    "population": {
      "populationNotes": "美国Fast Track项目幼儿园至二年级；中文工作译文未经验证。",
      "respondentTypes": [
        "PARENT"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 12,
      "estimatedMinutes": 4,
      "administrationModes": [
        "PAPER"
      ],
      "timeFrame": "观察者对一般行为的描述；原题未指定回忆期",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "原题以0–4评价符合程度；时长为产品估计。",
        "本中文译文是未验证工作稿。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原项目研究证据不等于中文工作译本验证。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "反馈属于家长观察视角，不替代儿童自身看法。"
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
        "evidenceId": "fasttrack-parent",
        "evidenceType": "INTERNAL_CONSISTENCY",
        "population": "US Fast Track parent-rated early childhood cohort",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Original project technical summary describes subscales and internal consistency.",
        "rating": "UNKNOWN",
        "citation": "Conduct Problems Prevention Research Group, Fast Track Project. Social Competence Scale — Parent Version. https://fasttrackproject.org/measure/social-competence-parent/",
        "url": "https://fasttrackproject.org/measure/social-competence-parent/",
        "notes": "美国项目证据不能作为中文译本或目标人群常模。"
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
      "respondentType": "parent_report",
      "source": {
        "title": "Social Competence Scale — Parent Version",
        "citation": "Conduct Problems Prevention Research Group, Fast Track Project. Social Competence Scale — Parent Version. https://fasttrackproject.org/measure/social-competence-parent/",
        "url": "https://fasttrackproject.org/measure/social-competence-parent/"
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "原项目网页标注可供公众使用；中文工作译本与数字分发的许可范围未独立确认。请注明 Conduct Problems Prevention Research Group / Fast Track Project。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "fasttrack_0_4",
          "options": [
            {
              "value": "0",
              "label": "完全不符合",
              "score": 0
            },
            {
              "value": "1",
              "label": "有一点符合",
              "score": 1
            },
            {
              "value": "2",
              "label": "中等程度符合",
              "score": 2
            },
            {
              "value": "3",
              "label": "比较符合",
              "score": 3
            },
            {
              "value": "4",
              "label": "非常符合",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "SCP-01",
          "content": "事情没有按照自己的意愿进行时，您的孩子能够接受。",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-02",
          "content": "您的孩子能妥善应对失败。",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-03",
          "content": "您的孩子行动之前会先思考。",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-04",
          "content": "您的孩子能够解决与朋友或兄弟姐妹之间的问题。",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-05",
          "content": "您的孩子兴奋或情绪激动时能够平静下来。",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-06",
          "content": "您的孩子能按照别人告诉他或她的去做。",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-07",
          "content": "您的孩子很善于理解他人的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-08",
          "content": "发生分歧时，您的孩子能够控制自己的脾气。",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-09",
          "content": "您的孩子会与他人分享东西。",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-10",
          "content": "您的孩子乐于帮助他人。",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-11",
          "content": "您的孩子会倾听他人的观点。",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCP-12",
          "content": "您的孩子能提出建议和意见，而不对他人发号施令。",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "SCP-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCP-12",
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
            "key": "prosocial",
            "type": "dimension",
            "label": "亲社会与沟通",
            "description": "相关题目的平均值；完整回答才计算。",
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
                  "itemCode": "SCP-04",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-07",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-09",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-10",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-11",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-12",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "regulation",
            "type": "dimension",
            "label": "情绪调节",
            "description": "相关题目的平均值；完整回答才计算。",
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
                  "itemCode": "SCP-01",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-02",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-03",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-05",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-06",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-08",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "total",
            "type": "total",
            "label": "全部12题平均",
            "description": "相关题目的平均值；完整回答才计算。",
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
                  "itemCode": "SCP-01",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-02",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-03",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-04",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-05",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-06",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-07",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-08",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-09",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-10",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-11",
                  "weight": 1
                },
                {
                  "itemCode": "SCP-12",
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
          "prosocial",
          "regulation"
        ],
        "scoreOrder": [
          "prosocial",
          "regulation",
          "total"
        ],
        "interpretations": [
          {
            "scoreKey": "prosocial",
            "headline": "与他人相处",
            "source": {
              "type": "score_only"
            },
            "summary": "这些回答记录您在日常相处中看到的分享、帮助、沟通和解决问题的情形。孩子在不同关系和情境中的表现可能不同。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "在哪些活动或关系中，孩子更容易与人合作或表达想法？"
              },
              {
                "category": "strategy",
                "text": "留意一次具体的合作或善意行为，描述您看到的细节，再给孩子表达自己的机会。"
              }
            ]
          },
          {
            "scoreKey": "regulation",
            "headline": "面对变化与情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "这些回答记录您看到孩子应对不如意、分歧和等待等情境的方式；情绪本身并没有对错。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "哪些情境更容易让孩子感到紧张？什么支持能帮助孩子恢复平静？"
              },
              {
                "category": "strategy",
                "text": "当事情不顺利时，先陪孩子暂停，再一起说出感受并想一个下一步。"
              }
            ]
          },
          {
            "scoreKey": "total",
            "headline": "整份观察记录",
            "source": {
              "type": "score_only"
            },
            "summary": "这个数字是全部12题的平均值，反映家长对家庭及社交情境的观察。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "有哪些内容是这份记录没有看见、需要向孩子或其他照顾者了解的？"
              },
              {
                "category": "strategy",
                "text": "选一件可以调整的小事，并约定之后再看看是否有帮助。"
              }
            ]
          }
        ],
        "limitations": [
          "这是家长在特定情境中的观察，不等同于孩子的感受或完整能力。",
          "中文为未经独立验证的工作译稿，原始美国研究不能作为中文人群常模。",
          "完整作答才计算是保守的产品约定，严于原项目对缺答的处理。",
          "不提供常模、百分位或高低等级。"
        ],
        "disclaimer": "本报告用于交流与反思，不用于诊断、筛查、选拔或排名。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-zero",
        "answers": [
          {
            "itemCode": "SCP-01",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-02",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-03",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-04",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-05",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-06",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-07",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-08",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-09",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-10",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-11",
            "responseValue": "0"
          },
          {
            "itemCode": "SCP-12",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "prosocial": 0,
            "regulation": 0,
            "total": 0
          },
          "totalScoreKeys": [
            "prosocial",
            "regulation",
            "total"
          ]
        }
      },
      {
        "name": "all-midpoint",
        "answers": [
          {
            "itemCode": "SCP-01",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-02",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-03",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-04",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-05",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-06",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-07",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-08",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-09",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-10",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-11",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-12",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "prosocial": 2,
            "regulation": 2,
            "total": 2
          },
          "totalScoreKeys": [
            "prosocial",
            "regulation",
            "total"
          ]
        }
      },
      {
        "name": "all-maximum",
        "answers": [
          {
            "itemCode": "SCP-01",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-02",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-03",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-04",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-05",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-06",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-07",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-08",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-09",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-10",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-11",
            "responseValue": "4"
          },
          {
            "itemCode": "SCP-12",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "prosocial": 4,
            "regulation": 4,
            "total": 4
          },
          "totalScoreKeys": [
            "prosocial",
            "regulation",
            "total"
          ]
        }
      },
      {
        "name": "missing-prosocial-item",
        "answers": [
          {
            "itemCode": "SCP-01",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-02",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-03",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-05",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-06",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-07",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-08",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-09",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-10",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-11",
            "responseValue": "2"
          },
          {
            "itemCode": "SCP-12",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "prosocial": null,
            "regulation": 2,
            "total": null
          },
          "totalScoreKeys": [
            "prosocial",
            "regulation",
            "total"
          ]
        }
      }
    ]
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "fasttrack-parent-v1",
    "respondentTypes": [
      "PARENT"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "fasttrack-parent-v1",
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
  }
} satisfies ScaleInstrumentSourceV1
