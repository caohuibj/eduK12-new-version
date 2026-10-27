import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// Unvalidated working translation. The observer and instrument form are explicit.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "fasttrack_scs_teacher_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Social Competence Scale — Teacher Version",
      "abbreviation": "SCS-SCT",
      "instrumentFamily": "Fast Track Social Competence Scale"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "ENGAGEMENT"
      ],
      "constructDefinition": "教师观察的儿童亲社会沟通和情绪调节，以及学校学习活动表现。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:k12", "response:teacher_report", "use:reflection", "use:research", "language_validation:chinese_working_translation", "license:translation_review_pending", "construct:sel_fasttrack_scs_prosocial", "construct:sel_fasttrack_scs_regulation", "construct:sel_fasttrack_scs_academic", "construct:sel_fasttrack_scs_social_emotional_combined", 
        "social_competence",
        "prosocial",
        "emotional_regulation",
        "teacher_report",
        "academic_behavior"
      ]
    },
    "population": {
      "populationNotes": "美国Fast Track项目幼儿园至三年级；中文工作译文未经验证。",
      "respondentTypes": [
        "TEACHER"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 25,
      "estimatedMinutes": 7,
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
          "notes": "反馈属于教师观察视角，不替代儿童自身看法。"
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
        "evidenceId": "fasttrack-teacher",
        "evidenceType": "INTERNAL_CONSISTENCY",
        "population": "US Fast Track teacher-rated early childhood cohort",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Original project technical summary describes subscales and internal consistency.",
        "rating": "UNKNOWN",
        "citation": "Conduct Problems Prevention Research Group, Fast Track Project. Social Competence Scale — Teacher Version. https://fasttrackproject.org/measure/social-competence-teacher/",
        "url": "https://fasttrackproject.org/measure/social-competence-teacher/",
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
      "respondentType": "teacher_report",
      "source": {
        "title": "Social Competence Scale — Teacher Version",
        "citation": "Conduct Problems Prevention Research Group, Fast Track Project. Social Competence Scale — Teacher Version. https://fasttrackproject.org/measure/social-competence-teacher/",
        "url": "https://fasttrackproject.org/measure/social-competence-teacher/"
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
          "itemCode": "SCT-01",
          "content": "即使有干扰，这个孩子仍能把事情做好。",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-02",
          "content": "事情没有按照自己的意愿进行时，这个孩子能够接受。",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-03",
          "content": "这个孩子能妥善应对失败。",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-04",
          "content": "这个孩子会主动开始做事。",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-05",
          "content": "没有成人的支持，这个孩子也能很好地工作或玩耍。",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-06",
          "content": "这个孩子能够接受合理设定的限制。",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-07",
          "content": "这个孩子能以恰当的方式表达自己的需要和感受。",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-08",
          "content": "这个孩子行动之前会先思考。",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-09",
          "content": "这个孩子能自己解决与同伴之间的问题。",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-10",
          "content": "这个孩子能持续专注于手头的任务。",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-11",
          "content": "这个孩子兴奋或情绪激动时能够平静下来。",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-12",
          "content": "有必要时，这个孩子能耐心排队等待。",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-13",
          "content": "这个孩子很善于理解他人的感受。",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-14",
          "content": "这个孩子意识到自己的行为对他人的影响。",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-15",
          "content": "这个孩子能够在小组中很好地工作。",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-16",
          "content": "这个孩子玩游戏时遵守规则。",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-17",
          "content": "这个孩子能够集中注意。",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-18",
          "content": "发生分歧时，这个孩子能够控制自己的脾气。",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-19",
          "content": "这个孩子会与他人分享材料。",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-20",
          "content": "这个孩子不需要提醒就能与同伴合作。",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-21",
          "content": "这个孩子能遵循老师的口头指示。",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-22",
          "content": "这个孩子乐于帮助他人。",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-23",
          "content": "这个孩子会倾听他人的观点。",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-24",
          "content": "这个孩子能提出建议和意见，而不对他人发号施令。",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SCT-25",
          "content": "这个孩子对他人表现友好。",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "fasttrack_0_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "SCT-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SCT-25",
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
                  "itemCode": "SCT-09",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-13",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-19",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-20",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-22",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-23",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-24",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-25",
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
                  "itemCode": "SCT-02",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-03",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-06",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-07",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-08",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-11",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-12",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-14",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-16",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-18",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "academic",
            "type": "dimension",
            "label": "学习活动表现",
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
                  "itemCode": "SCT-01",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-04",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-05",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-10",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-15",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-17",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-21",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "social_emotional_combined",
            "type": "dimension",
            "label": "亲社会与情绪调节合并",
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
                  "itemCode": "SCT-02",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-03",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-06",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-07",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-08",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-09",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-11",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-12",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-13",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-14",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-16",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-18",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-19",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-20",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-22",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-23",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-24",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-25",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "total",
            "type": "total",
            "label": "全部25题平均",
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
                  "itemCode": "SCT-01",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-02",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-03",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-04",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-05",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-06",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-07",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-08",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-09",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-10",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-11",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-12",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-13",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-14",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-15",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-16",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-17",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-18",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-19",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-20",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-21",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-22",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-23",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-24",
                  "weight": 1
                },
                {
                  "itemCode": "SCT-25",
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
          "regulation",
          "academic"
        ],
        "scoreOrder": [
          "prosocial",
          "regulation",
          "academic",
          "social_emotional_combined",
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
            "scoreKey": "academic",
            "headline": "参与学习与活动",
            "source": {
              "type": "score_only"
            },
            "summary": "这些回答涉及您观察到的注意、主动开始、独立活动和小组合作。环境、任务难度与支持都会影响表现。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "孩子在哪类任务或环境里更容易投入？什么情况会增加困难？"
              },
              {
                "category": "strategy",
                "text": "尝试把任务分成短步骤，减少干扰，并和孩子一起选择合适的支持。"
              }
            ]
          },
          {
            "scoreKey": "social_emotional_combined",
            "headline": "相处与调节的合并记录",
            "source": {
              "type": "score_only"
            },
            "summary": "这个平均值合并了亲社会与情绪调节的题目，适合与两个具体方向一起看；不能代替孩子自己的感受。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "合并记录是否掩盖了不同场景中的差异？"
              },
              {
                "category": "strategy",
                "text": "与孩子讨论一个具体情境，先听听孩子的说法。"
              }
            ]
          },
          {
            "scoreKey": "total",
            "headline": "整份观察记录",
            "source": {
              "type": "score_only"
            },
            "summary": "这个数字是全部25题的平均值，包含亲社会、情绪调节及学习活动，不是纯社会情绪总分。",
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
          "这是教师在特定情境中的观察，不等同于孩子的感受或完整能力。",
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
            "itemCode": "SCT-01",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-02",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-03",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-04",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-05",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-06",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-07",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-08",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-09",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-10",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-11",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-12",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-13",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-14",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-15",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-16",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-17",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-18",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-19",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-20",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-21",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-22",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-23",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-24",
            "responseValue": "0"
          },
          {
            "itemCode": "SCT-25",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "prosocial": 0,
            "regulation": 0,
            "academic": 0,
            "social_emotional_combined": 0,
            "total": 0
          },
          "totalScoreKeys": [
            "prosocial",
            "regulation",
            "academic",
            "social_emotional_combined",
            "total"
          ]
        }
      },
      {
        "name": "all-midpoint",
        "answers": [
          {
            "itemCode": "SCT-01",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-02",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-03",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-04",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-05",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-06",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-07",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-08",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-09",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-10",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-11",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-12",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-13",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-14",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-15",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-16",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-17",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-18",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-19",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-20",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-21",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-22",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-23",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-24",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-25",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "prosocial": 2,
            "regulation": 2,
            "academic": 2,
            "social_emotional_combined": 2,
            "total": 2
          },
          "totalScoreKeys": [
            "prosocial",
            "regulation",
            "academic",
            "social_emotional_combined",
            "total"
          ]
        }
      },
      {
        "name": "all-maximum",
        "answers": [
          {
            "itemCode": "SCT-01",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-02",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-03",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-04",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-05",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-06",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-07",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-08",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-09",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-10",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-11",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-12",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-13",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-14",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-15",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-16",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-17",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-18",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-19",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-20",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-21",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-22",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-23",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-24",
            "responseValue": "4"
          },
          {
            "itemCode": "SCT-25",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "prosocial": 4,
            "regulation": 4,
            "academic": 4,
            "social_emotional_combined": 4,
            "total": 4
          },
          "totalScoreKeys": [
            "prosocial",
            "regulation",
            "academic",
            "social_emotional_combined",
            "total"
          ]
        }
      },
      {
        "name": "missing-prosocial-item",
        "answers": [
          {
            "itemCode": "SCT-01",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-02",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-03",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-04",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-05",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-06",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-07",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-08",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-10",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-11",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-12",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-13",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-14",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-15",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-16",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-17",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-18",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-19",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-20",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-21",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-22",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-23",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-24",
            "responseValue": "2"
          },
          {
            "itemCode": "SCT-25",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "prosocial": null,
            "regulation": 2,
            "academic": 2,
            "social_emotional_combined": null,
            "total": null
          },
          "totalScoreKeys": [
            "prosocial",
            "regulation",
            "academic",
            "social_emotional_combined",
            "total"
          ]
        }
      }
    ]
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "fasttrack-teacher-v1",
    "respondentTypes": [
      "TEACHER"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "fasttrack-teacher-v1",
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
