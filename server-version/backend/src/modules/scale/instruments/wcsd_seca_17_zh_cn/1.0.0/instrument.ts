import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "wcsd_seca_17_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Washoe County School District Social–Emotional Competency Assessment — 17-item",
      "abbreviation": "WCSD-SECA-17",
      "instrumentFamily": "WCSD Social–Emotional Competency Assessment"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "SELF_REGULATION"
      ],
      "constructDefinition": "学生自评在社交与情绪相关知识及技能方面感到容易或困难的程度。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "orientation:casel", "population:k12", "response:student_self", "use:reflection", "use:research", "language_validation:chinese_working_translation", "license:translation_review_pending", 
        "social_emotional_competence",
        "self_awareness",
        "social_awareness",
        "self_management",
        "relationship_skills",
        "responsible_decision_making",
        "self_report"
      ]
    },
    "population": {
      "populationNotes": "原工具面向5–12年级学生；香港研究349名小学儿童，平均年龄9.86岁。中文为工作译文，尚未验证。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 17,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原版题意与1–4困难至容易选项；按2018版题序排列。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "描述性反馈，工作译文尚未验证。"
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
        "evidenceId": "wcsd-hk-2024",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Hong Kong school-aged children, n=349, mean age 9.86",
        "locale": "zh",
        "territory": "HK",
        "studyDesign": "Confirmatory factor analysis of 40 and 17 item versions. Study translation is not the present working translation.",
        "rating": "MIXED",
        "citation": "Cheung RYM, Ng OOS. Social–Emotional Competence among School-Aged Children in the Chinese Context. Behavioral Sciences. 2024;14:399.",
        "doi": "10.3390/bs14050399",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11117818/"
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en",
    "targetLocale": "zh-CN",
    "localizationVersion": "1.0.0",
    "translationSource": "独立工作译文，依据 Cheung & Ng 2024 Table 2；非该研究所用中文原表。",
    "adaptationMethod": "DIRECT_TRANSLATION",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [],
    "reviewStatus": "PENDING",
    "notes": "未完成中文适用性或认知访谈验证。"
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "wcsd-seca-self-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "wcsd-seca-self-v1",
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
        "itemScores": true,
        "methods": true,
        "educationalContent": false
      }
    },
    "unknownAudience": "DENY"
  },
  "instruction": {
    "schemaVersion": 1,
    "text": "请告诉我们，对你来说，做到下面每件事有多难或多容易。",
    "language": "zh-CN",
    "version": "1.0.0",
    "source": "2018 WCSD-SECA FAQ 前导语的中文工作译文： https://resources.finalsite.net/images/v1744936277/washoeschoolsnet/deitjtnxbl9xmua4l30r/wcsd_seca_faq_format_october_2018_final.pdf"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "zh-CN",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "WCSD Social–Emotional Competency Assessment",
        "citation": "Cheung RYM, Ng OOS. Behavioral Sciences. 2024;14:399. Table 2. DOI:10.3390/bs14050399.",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11117818/",
        "publicationYear": 2024
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题文来自 CC BY 4.0 论文 Table 2，附作者、来源与许可信息（https://creativecommons.org/licenses/by/4.0/），中文为改编工作译文；量表整体及中文工作译文的具体权利状态未独立核验。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "wcsd_difficulty_1_4",
          "options": [
            {
              "value": "1",
              "label": "非常困难",
              "score": 1
            },
            {
              "value": "2",
              "label": "困难",
              "score": 2
            },
            {
              "value": "3",
              "label": "容易",
              "score": 3
            },
            {
              "value": "4",
              "label": "非常容易",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "wc01",
          "content": "知道自己的长处是什么",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc05",
          "content": "知道什么时候自己的感受让我难以集中注意力",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc06",
          "content": "知道自己感受到的情绪",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc10",
          "content": "知道让自己平静下来的方法",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc11",
          "content": "向与我意见不同的人学习",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc12",
          "content": "从他人的表情知道他们可能有什么感受",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc13",
          "content": "知道什么时候有人需要帮助",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc16",
          "content": "即使感到沮丧，也能挺过困难",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc17",
          "content": "即使非常兴奋，也能耐心等待",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc20",
          "content": "即使任务对我来说很难，也能完成",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc21",
          "content": "为自己设定目标",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc24",
          "content": "即使不想做，也能做学校功课",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc25",
          "content": "为考试做好准备",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc30",
          "content": "与同学意见不一致时尊重对方的观点",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc31",
          "content": "与同学友好相处",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc36",
          "content": "做决定前想想可能会发生什么",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc37",
          "content": "知道什么是对的、什么是错的",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "wc01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc36",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc37",
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
            "key": "overall",
            "type": "total",
            "label": "社会情绪能力总体自评",
            "description": "题目回答的平均分；越高表示自评越容易。",
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
                  "itemCode": "wc01",
                  "weight": 1
                },
                {
                  "itemCode": "wc05",
                  "weight": 1
                },
                {
                  "itemCode": "wc06",
                  "weight": 1
                },
                {
                  "itemCode": "wc10",
                  "weight": 1
                },
                {
                  "itemCode": "wc11",
                  "weight": 1
                },
                {
                  "itemCode": "wc12",
                  "weight": 1
                },
                {
                  "itemCode": "wc13",
                  "weight": 1
                },
                {
                  "itemCode": "wc16",
                  "weight": 1
                },
                {
                  "itemCode": "wc17",
                  "weight": 1
                },
                {
                  "itemCode": "wc20",
                  "weight": 1
                },
                {
                  "itemCode": "wc21",
                  "weight": 1
                },
                {
                  "itemCode": "wc24",
                  "weight": 1
                },
                {
                  "itemCode": "wc25",
                  "weight": 1
                },
                {
                  "itemCode": "wc30",
                  "weight": 1
                },
                {
                  "itemCode": "wc31",
                  "weight": 1
                },
                {
                  "itemCode": "wc36",
                  "weight": 1
                },
                {
                  "itemCode": "wc37",
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
          "overall"
        ],
        "scoreOrder": [
          "overall"
        ],
        "interpretations": [
          {
            "scoreKey": "overall",
            "headline": "你的社交与情绪探索",
            "source": {
              "type": "score_only"
            },
            "summary": "这个数字汇总你对17件事情的回答：越高表示你觉得这些事情整体上越容易。你在不同情境中的感受可能不同，这不是给你贴标签。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "认识自己的长处：回想最近一件你做成的小事：你用了什么办法？"
              },
              {
                "category": "reflection",
                "text": "认识自己的情绪：当情绪影响专注时，什么能帮助你停下来？"
              },
              {
                "category": "reflection",
                "text": "留意他人：不确定别人怎么想时，你可以怎样温和地问一句？"
              },
              {
                "category": "reflection",
                "text": "与情绪一起行动：什么时候你更容易耐心等待，或继续完成一件事？"
              },
              {
                "category": "reflection",
                "text": "朝目标前进：选一件想做的小事，把第一步写得足够小。"
              },
              {
                "category": "reflection",
                "text": "安排学校功课：什么时间、地点或陪伴，让你更容易开始？"
              },
              {
                "category": "reflection",
                "text": "与他人相处：如果意见不同，你希望对方怎样听你说？"
              },
              {
                "category": "reflection",
                "text": "做决定之前：面对选择时，先问自己：接下来可能发生什么？"
              }
            ]
          }
        ],
        "limitations": [
          "这是一份学生自评，结果反映此次回答，可能受到情境、心情与经历影响。",
          "中文为工作译文，不是香港研究所用的已验证中文原表。",
          "没有适用于你的比较常模；分数不代表诊断或固定能力。",
          "简版主要提供总体反馈；每个具体方面的题目很少，提示仅供反思，不能视为稳定的分维测量。"
        ],
        "disclaimer": "这份报告帮助你回想和探索，不是诊断，也不用于给人排名。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-1",
        "answers": [
          {
            "itemCode": "wc01",
            "responseValue": "1"
          },
          {
            "itemCode": "wc05",
            "responseValue": "1"
          },
          {
            "itemCode": "wc06",
            "responseValue": "1"
          },
          {
            "itemCode": "wc10",
            "responseValue": "1"
          },
          {
            "itemCode": "wc11",
            "responseValue": "1"
          },
          {
            "itemCode": "wc12",
            "responseValue": "1"
          },
          {
            "itemCode": "wc13",
            "responseValue": "1"
          },
          {
            "itemCode": "wc16",
            "responseValue": "1"
          },
          {
            "itemCode": "wc17",
            "responseValue": "1"
          },
          {
            "itemCode": "wc20",
            "responseValue": "1"
          },
          {
            "itemCode": "wc21",
            "responseValue": "1"
          },
          {
            "itemCode": "wc24",
            "responseValue": "1"
          },
          {
            "itemCode": "wc25",
            "responseValue": "1"
          },
          {
            "itemCode": "wc30",
            "responseValue": "1"
          },
          {
            "itemCode": "wc31",
            "responseValue": "1"
          },
          {
            "itemCode": "wc36",
            "responseValue": "1"
          },
          {
            "itemCode": "wc37",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "overall": 1
          },
          "totalScoreKeys": [
            "overall"
          ]
        }
      },
      {
        "name": "all-4",
        "answers": [
          {
            "itemCode": "wc01",
            "responseValue": "4"
          },
          {
            "itemCode": "wc05",
            "responseValue": "4"
          },
          {
            "itemCode": "wc06",
            "responseValue": "4"
          },
          {
            "itemCode": "wc10",
            "responseValue": "4"
          },
          {
            "itemCode": "wc11",
            "responseValue": "4"
          },
          {
            "itemCode": "wc12",
            "responseValue": "4"
          },
          {
            "itemCode": "wc13",
            "responseValue": "4"
          },
          {
            "itemCode": "wc16",
            "responseValue": "4"
          },
          {
            "itemCode": "wc17",
            "responseValue": "4"
          },
          {
            "itemCode": "wc20",
            "responseValue": "4"
          },
          {
            "itemCode": "wc21",
            "responseValue": "4"
          },
          {
            "itemCode": "wc24",
            "responseValue": "4"
          },
          {
            "itemCode": "wc25",
            "responseValue": "4"
          },
          {
            "itemCode": "wc30",
            "responseValue": "4"
          },
          {
            "itemCode": "wc31",
            "responseValue": "4"
          },
          {
            "itemCode": "wc36",
            "responseValue": "4"
          },
          {
            "itemCode": "wc37",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "overall": 4
          },
          "totalScoreKeys": [
            "overall"
          ]
        }
      },
      {
        "name": "mixed",
        "answers": [
          {
            "itemCode": "wc01",
            "responseValue": "1"
          },
          {
            "itemCode": "wc05",
            "responseValue": "1"
          },
          {
            "itemCode": "wc06",
            "responseValue": "1"
          },
          {
            "itemCode": "wc10",
            "responseValue": "1"
          },
          {
            "itemCode": "wc11",
            "responseValue": "1"
          },
          {
            "itemCode": "wc12",
            "responseValue": "1"
          },
          {
            "itemCode": "wc13",
            "responseValue": "1"
          },
          {
            "itemCode": "wc16",
            "responseValue": "1"
          },
          {
            "itemCode": "wc17",
            "responseValue": "3"
          },
          {
            "itemCode": "wc20",
            "responseValue": "3"
          },
          {
            "itemCode": "wc21",
            "responseValue": "3"
          },
          {
            "itemCode": "wc24",
            "responseValue": "3"
          },
          {
            "itemCode": "wc25",
            "responseValue": "3"
          },
          {
            "itemCode": "wc30",
            "responseValue": "3"
          },
          {
            "itemCode": "wc31",
            "responseValue": "3"
          },
          {
            "itemCode": "wc36",
            "responseValue": "3"
          },
          {
            "itemCode": "wc37",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "overall": 2.0
          },
          "totalScoreKeys": [
            "overall"
          ]
        }
      },
      {
        "name": "missing-first-item",
        "answers": [
          {
            "itemCode": "wc05",
            "responseValue": "4"
          },
          {
            "itemCode": "wc06",
            "responseValue": "4"
          },
          {
            "itemCode": "wc10",
            "responseValue": "4"
          },
          {
            "itemCode": "wc11",
            "responseValue": "4"
          },
          {
            "itemCode": "wc12",
            "responseValue": "4"
          },
          {
            "itemCode": "wc13",
            "responseValue": "4"
          },
          {
            "itemCode": "wc16",
            "responseValue": "4"
          },
          {
            "itemCode": "wc17",
            "responseValue": "4"
          },
          {
            "itemCode": "wc20",
            "responseValue": "4"
          },
          {
            "itemCode": "wc21",
            "responseValue": "4"
          },
          {
            "itemCode": "wc24",
            "responseValue": "4"
          },
          {
            "itemCode": "wc25",
            "responseValue": "4"
          },
          {
            "itemCode": "wc30",
            "responseValue": "4"
          },
          {
            "itemCode": "wc31",
            "responseValue": "4"
          },
          {
            "itemCode": "wc36",
            "responseValue": "4"
          },
          {
            "itemCode": "wc37",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "overall": null
          },
          "totalScoreKeys": [
            "overall"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
