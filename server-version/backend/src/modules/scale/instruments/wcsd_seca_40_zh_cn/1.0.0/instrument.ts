import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "wcsd_seca_40_zh_cn",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Washoe County School District Social–Emotional Competency Assessment — 40-item",
      "abbreviation": "WCSD-SECA-40",
      "instrumentFamily": "WCSD Social–Emotional Competency Assessment"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "SELF_REGULATION"
      ],
      "constructDefinition": "学生自评在社交与情绪相关知识及技能方面感到容易或困难的程度。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "orientation:casel", "population:k12", "response:student_self", "use:reflection", "use:research", "language_validation:chinese_working_translation", "license:translation_review_pending", "construct:sel_wcsd_seca_self_concept", "construct:sel_wcsd_seca_emotion_knowledge", "construct:sel_wcsd_seca_social_awareness", "construct:sel_wcsd_seca_emotion_regulation", "construct:sel_wcsd_seca_goal_management", "construct:sel_wcsd_seca_school_work", "construct:sel_wcsd_seca_relationship_skills", "construct:sel_wcsd_seca_responsible_decision", 
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
      "itemCount": 40,
      "estimatedMinutes": 12,
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
          "itemCode": "wc02",
          "content": "知道怎样把在学校里觉得困难的事情做得更好",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc03",
          "content": "知道自己什么时候弄错了",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc04",
          "content": "知道什么时候有些事情我无法控制",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc05",
          "content": "知道什么时候自己的感受让我难以集中注意力",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc06",
          "content": "知道自己感受到的情绪",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc07",
          "content": "知道难过时怎样让自己感觉好一些",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc08",
          "content": "注意到自己紧张时身体的反应",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc09",
          "content": "知道什么时候自己的心情会影响我对待他人的方式",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc10",
          "content": "知道让自己平静下来的方法",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc11",
          "content": "向与我意见不同的人学习",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc12",
          "content": "从他人的表情知道他们可能有什么感受",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc13",
          "content": "知道什么时候有人需要帮助",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc14",
          "content": "与同学相处遇到困难时，知道怎样寻求帮助",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc15",
          "content": "知道自己的行为会怎样影响同学",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc16",
          "content": "即使感到沮丧，也能挺过困难",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc17",
          "content": "即使非常兴奋，也能耐心等待",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc18",
          "content": "感到有压力时保持平静",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc19",
          "content": "即使不喜欢，也能继续做事情",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc20",
          "content": "即使任务对我来说很难，也能完成",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc21",
          "content": "为自己设定目标",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc22",
          "content": "实现自己设定的目标",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc23",
          "content": "仔细想清楚实现目标需要哪些步骤",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc24",
          "content": "即使不想做，也能做学校功课",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc25",
          "content": "为考试做好准备",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc26",
          "content": "即使作业很难，也能继续完成",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc27",
          "content": "提前计划，以便按时交项目作业",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc28",
          "content": "不需要提醒就完成学校功课",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc29",
          "content": "即使有干扰，上课时也能保持专注",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc30",
          "content": "与同学意见不一致时尊重对方的观点",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc31",
          "content": "与同学友好相处",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc32",
          "content": "与他人分享自己的感受",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc33",
          "content": "在学校遇到问题时，和一位成年人谈谈",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc34",
          "content": "友好接纳平时不和我一起吃午饭的人",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc35",
          "content": "与老师友好相处",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc36",
          "content": "做决定前想想可能会发生什么",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc37",
          "content": "知道什么是对的、什么是错的",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc38",
          "content": "想出解决问题的不同方法",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc39",
          "content": "对想要违反规则的朋友说“不”",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "wcsd_difficulty_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "wc40",
          "content": "帮助让学校变得更好",
          "type": "single",
          "required": true,
          "sortOrder": 39,
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
            "itemCode": "wc02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc04",
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
            "itemCode": "wc07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc09",
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
            "itemCode": "wc14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc15",
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
            "itemCode": "wc18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc19",
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
            "itemCode": "wc22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc23",
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
            "itemCode": "wc26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc29",
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
            "itemCode": "wc32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc35",
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
          },
          {
            "itemCode": "wc38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc39",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "wc40",
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
            "key": "self_concept",
            "type": "dimension",
            "label": "自我觉察：自我概念",
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
                  "itemCode": "wc02",
                  "weight": 1
                },
                {
                  "itemCode": "wc03",
                  "weight": 1
                },
                {
                  "itemCode": "wc04",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "emotion_knowledge",
            "type": "dimension",
            "label": "自我觉察：情绪知识",
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
                  "itemCode": "wc05",
                  "weight": 1
                },
                {
                  "itemCode": "wc06",
                  "weight": 1
                },
                {
                  "itemCode": "wc07",
                  "weight": 1
                },
                {
                  "itemCode": "wc08",
                  "weight": 1
                },
                {
                  "itemCode": "wc09",
                  "weight": 1
                },
                {
                  "itemCode": "wc10",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "social_awareness",
            "type": "dimension",
            "label": "社会觉察",
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
                  "itemCode": "wc14",
                  "weight": 1
                },
                {
                  "itemCode": "wc15",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "emotion_regulation",
            "type": "dimension",
            "label": "自我管理：情绪调节",
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
                  "itemCode": "wc16",
                  "weight": 1
                },
                {
                  "itemCode": "wc17",
                  "weight": 1
                },
                {
                  "itemCode": "wc18",
                  "weight": 1
                },
                {
                  "itemCode": "wc19",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "goal_management",
            "type": "dimension",
            "label": "自我管理：目标管理",
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
                  "itemCode": "wc20",
                  "weight": 1
                },
                {
                  "itemCode": "wc21",
                  "weight": 1
                },
                {
                  "itemCode": "wc22",
                  "weight": 1
                },
                {
                  "itemCode": "wc23",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "school_work",
            "type": "dimension",
            "label": "自我管理：学校功课",
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
                  "itemCode": "wc24",
                  "weight": 1
                },
                {
                  "itemCode": "wc25",
                  "weight": 1
                },
                {
                  "itemCode": "wc26",
                  "weight": 1
                },
                {
                  "itemCode": "wc27",
                  "weight": 1
                },
                {
                  "itemCode": "wc28",
                  "weight": 1
                },
                {
                  "itemCode": "wc29",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "relationship_skills",
            "type": "dimension",
            "label": "人际关系技能",
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
                  "itemCode": "wc30",
                  "weight": 1
                },
                {
                  "itemCode": "wc31",
                  "weight": 1
                },
                {
                  "itemCode": "wc32",
                  "weight": 1
                },
                {
                  "itemCode": "wc33",
                  "weight": 1
                },
                {
                  "itemCode": "wc34",
                  "weight": 1
                },
                {
                  "itemCode": "wc35",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "responsible_decision",
            "type": "dimension",
            "label": "负责任的决策",
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
                  "itemCode": "wc36",
                  "weight": 1
                },
                {
                  "itemCode": "wc37",
                  "weight": 1
                },
                {
                  "itemCode": "wc38",
                  "weight": 1
                },
                {
                  "itemCode": "wc39",
                  "weight": 1
                },
                {
                  "itemCode": "wc40",
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
          "self_concept",
          "emotion_knowledge",
          "social_awareness",
          "emotion_regulation",
          "goal_management",
          "school_work",
          "relationship_skills",
          "responsible_decision"
        ],
        "scoreOrder": [
          "self_concept",
          "emotion_knowledge",
          "social_awareness",
          "emotion_regulation",
          "goal_management",
          "school_work",
          "relationship_skills",
          "responsible_decision"
        ],
        "interpretations": [
          {
            "scoreKey": "self_concept",
            "headline": "认识自己的长处",
            "source": {
              "type": "score_only"
            },
            "summary": "有时长处藏在小事里，也可能是在努力学习的事情。 本次分数是这组题目回答的平均值；越高表示你觉得越容易。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想最近一件你做成的小事：你用了什么办法？"
              }
            ]
          },
          {
            "scoreKey": "emotion_knowledge",
            "headline": "认识自己的情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "留意感受、情绪对注意力的影响，以及让自己平静的方法。 本次分数是这组题目回答的平均值；越高表示你觉得越容易。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "当情绪影响专注时，什么能帮助你停下来？"
              }
            ]
          },
          {
            "scoreKey": "social_awareness",
            "headline": "留意他人",
            "source": {
              "type": "score_only"
            },
            "summary": "观察他人的感受，发现需要帮助的人，也试着听不同的想法。 本次分数是这组题目回答的平均值；越高表示你觉得越容易。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "不确定别人怎么想时，你可以怎样温和地问一句？"
              }
            ]
          },
          {
            "scoreKey": "emotion_regulation",
            "headline": "与情绪一起行动",
            "source": {
              "type": "score_only"
            },
            "summary": "沮丧时继续做事、兴奋时耐心等待，都可能因情境而变得容易或困难。 本次分数是这组题目回答的平均值；越高表示你觉得越容易。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "什么时候你更容易耐心等待，或继续完成一件事？"
              }
            ]
          },
          {
            "scoreKey": "goal_management",
            "headline": "朝目标前进",
            "source": {
              "type": "score_only"
            },
            "summary": "从设定目标到完成困难任务，每一步都可以练习。 本次分数是这组题目回答的平均值；越高表示你觉得越容易。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "选一件想做的小事，把第一步写得足够小。"
              }
            ]
          },
          {
            "scoreKey": "school_work",
            "headline": "安排学校功课",
            "source": {
              "type": "score_only"
            },
            "summary": "做功课、准备考试与保持专注，都可能受任务和环境影响。 本次分数是这组题目回答的平均值；越高表示你觉得越容易。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "什么时间、地点或陪伴，让你更容易开始？"
              }
            ]
          },
          {
            "scoreKey": "relationship_skills",
            "headline": "与他人相处",
            "source": {
              "type": "score_only"
            },
            "summary": "在同学意见不同时尊重彼此，并留意如何与他人相处。 本次分数是这组题目回答的平均值；越高表示你觉得越容易。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "如果意见不同，你希望对方怎样听你说？"
              }
            ]
          },
          {
            "scoreKey": "responsible_decision",
            "headline": "做决定之前",
            "source": {
              "type": "score_only"
            },
            "summary": "做决定前想想可能发生什么，并考虑不同选择。 本次分数是这组题目回答的平均值；越高表示你觉得越容易。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "面对选择时，先问自己：接下来可能发生什么？"
              }
            ]
          }
        ],
        "limitations": [
          "这是一份学生自评，结果反映此次回答，可能受到情境、心情与经历影响。",
          "中文为工作译文，不是香港研究所用的已验证中文原表。",
          "没有适用于你的比较常模；分数不代表诊断或固定能力。"
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
            "itemCode": "wc02",
            "responseValue": "1"
          },
          {
            "itemCode": "wc03",
            "responseValue": "1"
          },
          {
            "itemCode": "wc04",
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
            "itemCode": "wc07",
            "responseValue": "1"
          },
          {
            "itemCode": "wc08",
            "responseValue": "1"
          },
          {
            "itemCode": "wc09",
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
            "itemCode": "wc14",
            "responseValue": "1"
          },
          {
            "itemCode": "wc15",
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
            "itemCode": "wc18",
            "responseValue": "1"
          },
          {
            "itemCode": "wc19",
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
            "itemCode": "wc22",
            "responseValue": "1"
          },
          {
            "itemCode": "wc23",
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
            "itemCode": "wc26",
            "responseValue": "1"
          },
          {
            "itemCode": "wc27",
            "responseValue": "1"
          },
          {
            "itemCode": "wc28",
            "responseValue": "1"
          },
          {
            "itemCode": "wc29",
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
            "itemCode": "wc32",
            "responseValue": "1"
          },
          {
            "itemCode": "wc33",
            "responseValue": "1"
          },
          {
            "itemCode": "wc34",
            "responseValue": "1"
          },
          {
            "itemCode": "wc35",
            "responseValue": "1"
          },
          {
            "itemCode": "wc36",
            "responseValue": "1"
          },
          {
            "itemCode": "wc37",
            "responseValue": "1"
          },
          {
            "itemCode": "wc38",
            "responseValue": "1"
          },
          {
            "itemCode": "wc39",
            "responseValue": "1"
          },
          {
            "itemCode": "wc40",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_concept": 1,
            "emotion_knowledge": 1,
            "social_awareness": 1,
            "emotion_regulation": 1,
            "goal_management": 1,
            "school_work": 1,
            "relationship_skills": 1,
            "responsible_decision": 1
          },
          "totalScoreKeys": [
            "self_concept",
            "emotion_knowledge",
            "social_awareness",
            "emotion_regulation",
            "goal_management",
            "school_work",
            "relationship_skills",
            "responsible_decision"
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
            "itemCode": "wc02",
            "responseValue": "4"
          },
          {
            "itemCode": "wc03",
            "responseValue": "4"
          },
          {
            "itemCode": "wc04",
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
            "itemCode": "wc07",
            "responseValue": "4"
          },
          {
            "itemCode": "wc08",
            "responseValue": "4"
          },
          {
            "itemCode": "wc09",
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
            "itemCode": "wc14",
            "responseValue": "4"
          },
          {
            "itemCode": "wc15",
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
            "itemCode": "wc18",
            "responseValue": "4"
          },
          {
            "itemCode": "wc19",
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
            "itemCode": "wc22",
            "responseValue": "4"
          },
          {
            "itemCode": "wc23",
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
            "itemCode": "wc26",
            "responseValue": "4"
          },
          {
            "itemCode": "wc27",
            "responseValue": "4"
          },
          {
            "itemCode": "wc28",
            "responseValue": "4"
          },
          {
            "itemCode": "wc29",
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
            "itemCode": "wc32",
            "responseValue": "4"
          },
          {
            "itemCode": "wc33",
            "responseValue": "4"
          },
          {
            "itemCode": "wc34",
            "responseValue": "4"
          },
          {
            "itemCode": "wc35",
            "responseValue": "4"
          },
          {
            "itemCode": "wc36",
            "responseValue": "4"
          },
          {
            "itemCode": "wc37",
            "responseValue": "4"
          },
          {
            "itemCode": "wc38",
            "responseValue": "4"
          },
          {
            "itemCode": "wc39",
            "responseValue": "4"
          },
          {
            "itemCode": "wc40",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_concept": 4,
            "emotion_knowledge": 4,
            "social_awareness": 4,
            "emotion_regulation": 4,
            "goal_management": 4,
            "school_work": 4,
            "relationship_skills": 4,
            "responsible_decision": 4
          },
          "totalScoreKeys": [
            "self_concept",
            "emotion_knowledge",
            "social_awareness",
            "emotion_regulation",
            "goal_management",
            "school_work",
            "relationship_skills",
            "responsible_decision"
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
            "itemCode": "wc02",
            "responseValue": "1"
          },
          {
            "itemCode": "wc03",
            "responseValue": "1"
          },
          {
            "itemCode": "wc04",
            "responseValue": "1"
          },
          {
            "itemCode": "wc05",
            "responseValue": "2"
          },
          {
            "itemCode": "wc06",
            "responseValue": "2"
          },
          {
            "itemCode": "wc07",
            "responseValue": "2"
          },
          {
            "itemCode": "wc08",
            "responseValue": "2"
          },
          {
            "itemCode": "wc09",
            "responseValue": "2"
          },
          {
            "itemCode": "wc10",
            "responseValue": "2"
          },
          {
            "itemCode": "wc11",
            "responseValue": "3"
          },
          {
            "itemCode": "wc12",
            "responseValue": "3"
          },
          {
            "itemCode": "wc13",
            "responseValue": "3"
          },
          {
            "itemCode": "wc14",
            "responseValue": "3"
          },
          {
            "itemCode": "wc15",
            "responseValue": "3"
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
            "itemCode": "wc18",
            "responseValue": "4"
          },
          {
            "itemCode": "wc19",
            "responseValue": "4"
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
            "itemCode": "wc22",
            "responseValue": "1"
          },
          {
            "itemCode": "wc23",
            "responseValue": "1"
          },
          {
            "itemCode": "wc24",
            "responseValue": "2"
          },
          {
            "itemCode": "wc25",
            "responseValue": "2"
          },
          {
            "itemCode": "wc26",
            "responseValue": "2"
          },
          {
            "itemCode": "wc27",
            "responseValue": "2"
          },
          {
            "itemCode": "wc28",
            "responseValue": "2"
          },
          {
            "itemCode": "wc29",
            "responseValue": "2"
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
            "itemCode": "wc32",
            "responseValue": "3"
          },
          {
            "itemCode": "wc33",
            "responseValue": "3"
          },
          {
            "itemCode": "wc34",
            "responseValue": "3"
          },
          {
            "itemCode": "wc35",
            "responseValue": "3"
          },
          {
            "itemCode": "wc36",
            "responseValue": "4"
          },
          {
            "itemCode": "wc37",
            "responseValue": "4"
          },
          {
            "itemCode": "wc38",
            "responseValue": "4"
          },
          {
            "itemCode": "wc39",
            "responseValue": "4"
          },
          {
            "itemCode": "wc40",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_concept": 1.0,
            "emotion_knowledge": 2.0,
            "social_awareness": 3.0,
            "emotion_regulation": 4.0,
            "goal_management": 1.0,
            "school_work": 2.0,
            "relationship_skills": 3.0,
            "responsible_decision": 4.0
          },
          "totalScoreKeys": [
            "self_concept",
            "emotion_knowledge",
            "social_awareness",
            "emotion_regulation",
            "goal_management",
            "school_work",
            "relationship_skills",
            "responsible_decision"
          ]
        }
      },
      {
        "name": "report-sample",
        "answers": [
          {
            "itemCode": "wc01",
            "responseValue": "1"
          },
          {
            "itemCode": "wc02",
            "responseValue": "1"
          },
          {
            "itemCode": "wc03",
            "responseValue": "1"
          },
          {
            "itemCode": "wc04",
            "responseValue": "1"
          },
          {
            "itemCode": "wc05",
            "responseValue": "3"
          },
          {
            "itemCode": "wc06",
            "responseValue": "3"
          },
          {
            "itemCode": "wc07",
            "responseValue": "3"
          },
          {
            "itemCode": "wc08",
            "responseValue": "3"
          },
          {
            "itemCode": "wc09",
            "responseValue": "3"
          },
          {
            "itemCode": "wc10",
            "responseValue": "3"
          },
          {
            "itemCode": "wc11",
            "responseValue": "2"
          },
          {
            "itemCode": "wc12",
            "responseValue": "2"
          },
          {
            "itemCode": "wc13",
            "responseValue": "2"
          },
          {
            "itemCode": "wc14",
            "responseValue": "2"
          },
          {
            "itemCode": "wc15",
            "responseValue": "2"
          },
          {
            "itemCode": "wc16",
            "responseValue": "2"
          },
          {
            "itemCode": "wc17",
            "responseValue": "3"
          },
          {
            "itemCode": "wc18",
            "responseValue": "2"
          },
          {
            "itemCode": "wc19",
            "responseValue": "3"
          },
          {
            "itemCode": "wc20",
            "responseValue": "2"
          },
          {
            "itemCode": "wc21",
            "responseValue": "3"
          },
          {
            "itemCode": "wc22",
            "responseValue": "2"
          },
          {
            "itemCode": "wc23",
            "responseValue": "3"
          },
          {
            "itemCode": "wc24",
            "responseValue": "2"
          },
          {
            "itemCode": "wc25",
            "responseValue": "3"
          },
          {
            "itemCode": "wc26",
            "responseValue": "2"
          },
          {
            "itemCode": "wc27",
            "responseValue": "3"
          },
          {
            "itemCode": "wc28",
            "responseValue": "2"
          },
          {
            "itemCode": "wc29",
            "responseValue": "3"
          },
          {
            "itemCode": "wc30",
            "responseValue": "2"
          },
          {
            "itemCode": "wc31",
            "responseValue": "3"
          },
          {
            "itemCode": "wc32",
            "responseValue": "2"
          },
          {
            "itemCode": "wc33",
            "responseValue": "3"
          },
          {
            "itemCode": "wc34",
            "responseValue": "2"
          },
          {
            "itemCode": "wc35",
            "responseValue": "3"
          },
          {
            "itemCode": "wc36",
            "responseValue": "1"
          },
          {
            "itemCode": "wc37",
            "responseValue": "2"
          },
          {
            "itemCode": "wc38",
            "responseValue": "3"
          },
          {
            "itemCode": "wc39",
            "responseValue": "3"
          },
          {
            "itemCode": "wc40",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_concept": 1.0,
            "emotion_knowledge": 3.0,
            "social_awareness": 2.0,
            "emotion_regulation": 2.5,
            "goal_management": 2.5,
            "school_work": 2.5,
            "relationship_skills": 2.5,
            "responsible_decision": 2.6
          },
          "totalScoreKeys": [
            "self_concept",
            "emotion_knowledge",
            "social_awareness",
            "emotion_regulation",
            "goal_management",
            "school_work",
            "relationship_skills",
            "responsible_decision"
          ]
        }
      },
      {
        "name": "missing-first-item",
        "answers": [
          {
            "itemCode": "wc02",
            "responseValue": "4"
          },
          {
            "itemCode": "wc03",
            "responseValue": "4"
          },
          {
            "itemCode": "wc04",
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
            "itemCode": "wc07",
            "responseValue": "4"
          },
          {
            "itemCode": "wc08",
            "responseValue": "4"
          },
          {
            "itemCode": "wc09",
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
            "itemCode": "wc14",
            "responseValue": "4"
          },
          {
            "itemCode": "wc15",
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
            "itemCode": "wc18",
            "responseValue": "4"
          },
          {
            "itemCode": "wc19",
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
            "itemCode": "wc22",
            "responseValue": "4"
          },
          {
            "itemCode": "wc23",
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
            "itemCode": "wc26",
            "responseValue": "4"
          },
          {
            "itemCode": "wc27",
            "responseValue": "4"
          },
          {
            "itemCode": "wc28",
            "responseValue": "4"
          },
          {
            "itemCode": "wc29",
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
            "itemCode": "wc32",
            "responseValue": "4"
          },
          {
            "itemCode": "wc33",
            "responseValue": "4"
          },
          {
            "itemCode": "wc34",
            "responseValue": "4"
          },
          {
            "itemCode": "wc35",
            "responseValue": "4"
          },
          {
            "itemCode": "wc36",
            "responseValue": "4"
          },
          {
            "itemCode": "wc37",
            "responseValue": "4"
          },
          {
            "itemCode": "wc38",
            "responseValue": "4"
          },
          {
            "itemCode": "wc39",
            "responseValue": "4"
          },
          {
            "itemCode": "wc40",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "self_concept": null,
            "emotion_knowledge": 4,
            "social_awareness": 4,
            "emotion_regulation": 4,
            "goal_management": 4,
            "school_work": 4,
            "relationship_skills": 4,
            "responsible_decision": 4
          },
          "totalScoreKeys": [
            "self_concept",
            "emotion_knowledge",
            "social_awareness",
            "emotion_regulation",
            "goal_management",
            "school_work",
            "relationship_skills",
            "responsible_decision"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
