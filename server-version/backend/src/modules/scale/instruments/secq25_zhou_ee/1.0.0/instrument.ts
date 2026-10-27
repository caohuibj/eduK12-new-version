import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item wording from the 2012 paper, Appendix p.42; NC and ND journal terms noted.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "secq25_zhou_ee",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Social Emotional Competence Questionnaire (Zhou & Ee, 2012)",
      "abbreviation": "SECQ-25",
      "instrumentFamily": "Social Emotional Competence Questionnaire"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "SELF_REGULATION"
      ],
      "constructDefinition": "自陈的自我觉察、社会觉察、自我管理、关系管理和负责的决策。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "orientation:casel", "population:k12", "response:student_self", "use:reflection", "use:research", "language_validation:english_original", "license:noncommercial", "construct:sel_secq25_self_awareness", "construct:sel_secq25_social_awareness", "construct:sel_secq25_self_management", "construct:sel_secq25_relationship_management", "construct:sel_secq25_responsible_decision_making", 
        "social_emotional_competence",
        "self_awareness",
        "social_awareness",
        "self_management",
        "relationship_management",
        "responsible_decision_making",
        "self_report"
      ]
    },
    "population": {
      "gradeRange": {
        "minGrade": 3,
        "maxGrade": 12
      },
      "populationNotes": "原论文面向三至十二年级；结构验证样本为新加坡四年级及中学生，英文施测。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 25,
      "estimatedMinutes": 8,
      "administrationModes": [
        "PAPER"
      ],
      "timeFrame": "一般自我描述，原文未指定回忆期",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "英文原题第42页；1与6保留原文端点，中间2–5仅显示数字。预计时长为产品估计。",
        "SA5保留作者自我觉察归属。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "英文原版在新加坡研究；其他人群需验证。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN"
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
        "evidenceId": "zhou-ee-2012-primary",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Singapore fourth-grade students",
        "locale": "en",
        "territory": "SG",
        "sampleSize": 444,
        "studyDesign": "Confirmatory factor analysis of the 25-item model after incomplete cases were removed.",
        "rating": "MIXED",
        "citation": "Zhou M, Ee J. (2012). Development and validation of the Social Emotional Competence Questionnaire (SECQ). International Journal of Emotional Education, 4(2), 27–42.",
        "url": "https://www.um.edu.mt/library/oar/bitstream/123456789/6140/1/ENSECV4I2P2.pdf",
        "notes": "CFI and IFI .89; several primary-sample subscales had alpha below .70."
      },
      {
        "evidenceId": "zhou-ee-2012-secondary",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Singapore secondary school students",
        "locale": "en",
        "territory": "SG",
        "sampleSize": 356,
        "studyDesign": "Confirmatory factor analysis of the five-factor model.",
        "rating": "MIXED",
        "citation": "Zhou M, Ee J. (2012). Development and validation of the Social Emotional Competence Questionnaire (SECQ). International Journal of Emotional Education, 4(2), 27–42.",
        "url": "https://www.um.edu.mt/library/oar/bitstream/123456789/6140/1/ENSECV4I2P2.pdf",
        "notes": "CFI and IFI .86; findings do not constitute local norms."
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "secq25-zhou-ee-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "secq25-zhou-ee-v1",
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
        "title": "Social Emotional Competence Questionnaire",
        "citation": "Zhou M, Ee J. (2012). Development and validation of the Social Emotional Competence Questionnaire (SECQ). International Journal of Emotional Education, 4(2), 27–42.",
        "url": "https://www.um.edu.mt/library/oar/bitstream/123456789/6140/1/ENSECV4I2P2.pdf",
        "publicationYear": 2012
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "2012论文页脚© EDRES/ENSEC。期刊现行声明所有论文CC BY-NC-ND 4.0（https://www.um.edu.mt/ijee/openaccess/）；非商业、禁止分发改编。其对2012论文及附录题本独立权利范围未确认；英文原文保持原样，不声明商业或中文译文授权。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "secq_1_6",
          "options": [
            {
              "value": "1",
              "label": "Not at all true of me",
              "score": 1
            },
            {
              "value": "2",
              "label": "2",
              "score": 2
            },
            {
              "value": "3",
              "label": "3",
              "score": 3
            },
            {
              "value": "4",
              "label": "4",
              "score": 4
            },
            {
              "value": "5",
              "label": "5",
              "score": 5
            },
            {
              "value": "6",
              "label": "Very true of me",
              "score": 6
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "SA1",
          "content": "I know what I am thinking and doing.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SA2",
          "content": "I understand why I do what I do.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SA3",
          "content": "I understand my moods and feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SA4",
          "content": "I know when I am moody.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SA5",
          "content": "I can read people’s faces when they are angry.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SoA1",
          "content": "I recognise how people feel by looking at their facial expressions.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SoA2",
          "content": "It is easy for me to understand why people feel the way they do.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SoA3",
          "content": "If someone is sad, angry or happy, I believe I know what they are thinking.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SoA4",
          "content": "I understand why people react the way they do.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SoA5",
          "content": "If a friend is upset, I have a pretty good idea why.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SM1",
          "content": "I can stay calm in stressful situations.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SM2",
          "content": "I stay calm and overcome anxiety in new or changing situations.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SM3",
          "content": "I stay calm when things go wrong.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SM4",
          "content": "I can control the way I feel when something bad happens.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "SM5",
          "content": "When I am upset with someone, I will wait till I have calmed down before discussing the issue.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RM1",
          "content": "I will always apologise when I hurt my friend unintentionally.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RM2",
          "content": "I always try and comfort my friends when they are sad.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RM3",
          "content": "I try not to criticise my friend when we quarrel.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RM4",
          "content": "I am tolerant of my friend’s mistakes.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RM5",
          "content": "I stand up for myself without putting others down.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RDM1",
          "content": "When making decisions, I take into account the consequences of my actions.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RDM2",
          "content": "I ensure that there are more positive outcomes when making a choice.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RDM3",
          "content": "I weigh the strengths of the situation before deciding on my action.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RDM4",
          "content": "I consider the criteria chosen before making a recommendation.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RDM5",
          "content": "I consider the strengths and weaknesses of the strategy before deciding to use it.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "secq_1_6",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "SA1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SA2",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SA3",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SA4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SA5",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SoA1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SoA2",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SoA3",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SoA4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SoA5",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SM1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SM2",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SM3",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SM4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SM5",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RM1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RM2",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RM3",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RM4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RM5",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RDM1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RDM2",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RDM3",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RDM4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RDM5",
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
            "key": "self_awareness",
            "type": "dimension",
            "label": "自我觉察",
            "description": "五题完整时计算1–6均值；SA5按作者归属保留。",
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
                  "itemCode": "SA1",
                  "weight": 1
                },
                {
                  "itemCode": "SA2",
                  "weight": 1
                },
                {
                  "itemCode": "SA3",
                  "weight": 1
                },
                {
                  "itemCode": "SA4",
                  "weight": 1
                },
                {
                  "itemCode": "SA5",
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
            "description": "五题完整时计算1–6均值。",
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
                  "itemCode": "SoA1",
                  "weight": 1
                },
                {
                  "itemCode": "SoA2",
                  "weight": 1
                },
                {
                  "itemCode": "SoA3",
                  "weight": 1
                },
                {
                  "itemCode": "SoA4",
                  "weight": 1
                },
                {
                  "itemCode": "SoA5",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "self_management",
            "type": "dimension",
            "label": "自我管理",
            "description": "五题完整时计算1–6均值。",
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
                  "itemCode": "SM1",
                  "weight": 1
                },
                {
                  "itemCode": "SM2",
                  "weight": 1
                },
                {
                  "itemCode": "SM3",
                  "weight": 1
                },
                {
                  "itemCode": "SM4",
                  "weight": 1
                },
                {
                  "itemCode": "SM5",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "relationship_management",
            "type": "dimension",
            "label": "关系管理",
            "description": "五题完整时计算1–6均值。",
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
                  "itemCode": "RM1",
                  "weight": 1
                },
                {
                  "itemCode": "RM2",
                  "weight": 1
                },
                {
                  "itemCode": "RM3",
                  "weight": 1
                },
                {
                  "itemCode": "RM4",
                  "weight": 1
                },
                {
                  "itemCode": "RM5",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "responsible_decision_making",
            "type": "dimension",
            "label": "负责的决策",
            "description": "五题完整时计算1–6均值。",
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
                  "itemCode": "RDM1",
                  "weight": 1
                },
                {
                  "itemCode": "RDM2",
                  "weight": 1
                },
                {
                  "itemCode": "RDM3",
                  "weight": 1
                },
                {
                  "itemCode": "RDM4",
                  "weight": 1
                },
                {
                  "itemCode": "RDM5",
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
          "self_awareness",
          "social_awareness",
          "self_management",
          "relationship_management",
          "responsible_decision_making"
        ],
        "scoreOrder": [
          "self_awareness",
          "social_awareness",
          "self_management",
          "relationship_management",
          "responsible_decision_making"
        ],
        "interpretations": [
          {
            "scoreKey": "self_awareness",
            "headline": "留意心里的天气",
            "source": {
              "type": "score_only"
            },
            "summary": "这部分涉及你对想法、行动和心情的观察。感受有时清楚，有时需要多一点时间。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次心情变化时，身体或脑海里最先出现了什么信号？"
              },
              {
                "category": "strategy",
                "text": "今天找一个时刻，用两个词写下“我现在感觉……因为……”。"
              }
            ]
          },
          {
            "scoreKey": "social_awareness",
            "headline": "给别人的感受留一点空间",
            "source": {
              "type": "score_only"
            },
            "summary": "别人的表情和行为可以提供线索，但不一定说出全部故事。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "哪一次你以为懂了朋友的心情，后来发现事情还有另一面？"
              },
              {
                "category": "strategy",
                "text": "当对方愿意时，可以问：“你愿意告诉我发生了什么吗？”"
              }
            ]
          },
          {
            "scoreKey": "self_management",
            "headline": "给自己一个暂停键",
            "source": {
              "type": "score_only"
            },
            "summary": "遇到难事时感到紧张、烦躁都很自然；可以练习照顾感受，再选择下一步。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "当你情绪很强烈时，什么方式会让你稍微缓下来？"
              },
              {
                "category": "strategy",
                "text": "需要时停一停、慢慢呼吸几次或喝口水，再决定下一步。"
              }
            ]
          },
          {
            "scoreKey": "relationship_management",
            "headline": "在靠近别人时也照顾自己",
            "source": {
              "type": "score_only"
            },
            "summary": "关系里可以关心别人，也可以清楚说出自己的需要。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "和朋友意见不同时，你希望对方怎样听你说话？"
              },
              {
                "category": "strategy",
                "text": "用“我感到……，我希望……”开始一段对话，给彼此说完的时间。"
              }
            ]
          },
          {
            "scoreKey": "responsible_decision_making",
            "headline": "让选择多经过一站思考",
            "source": {
              "type": "score_only"
            },
            "summary": "做决定不必每次都找到完美答案；停下来看看可能发生什么，能让下一步更清楚。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一个让你犹豫的选择，会怎样影响你和其他人？"
              },
              {
                "category": "strategy",
                "text": "把两个可行选择写下来，各记一个可能的好处和困难；需要时找信任的人一起想。"
              }
            ]
          }
        ],
        "limitations": [
          "这是英文作答的自我描述；本地中文样本适用性未在原研究中建立。",
          "没有常模、临界值或个体高低等级。",
          "各维5题完整才计算平均分是产品约定，不是原文明确的个体缺答规则。"
        ],
        "disclaimer": "用于学习与自我反思，不用于诊断、选拔或排名。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-minimum",
        "answers": [
          {
            "itemCode": "SA1",
            "responseValue": "1"
          },
          {
            "itemCode": "SA2",
            "responseValue": "1"
          },
          {
            "itemCode": "SA3",
            "responseValue": "1"
          },
          {
            "itemCode": "SA4",
            "responseValue": "1"
          },
          {
            "itemCode": "SA5",
            "responseValue": "1"
          },
          {
            "itemCode": "SoA1",
            "responseValue": "1"
          },
          {
            "itemCode": "SoA2",
            "responseValue": "1"
          },
          {
            "itemCode": "SoA3",
            "responseValue": "1"
          },
          {
            "itemCode": "SoA4",
            "responseValue": "1"
          },
          {
            "itemCode": "SoA5",
            "responseValue": "1"
          },
          {
            "itemCode": "SM1",
            "responseValue": "1"
          },
          {
            "itemCode": "SM2",
            "responseValue": "1"
          },
          {
            "itemCode": "SM3",
            "responseValue": "1"
          },
          {
            "itemCode": "SM4",
            "responseValue": "1"
          },
          {
            "itemCode": "SM5",
            "responseValue": "1"
          },
          {
            "itemCode": "RM1",
            "responseValue": "1"
          },
          {
            "itemCode": "RM2",
            "responseValue": "1"
          },
          {
            "itemCode": "RM3",
            "responseValue": "1"
          },
          {
            "itemCode": "RM4",
            "responseValue": "1"
          },
          {
            "itemCode": "RM5",
            "responseValue": "1"
          },
          {
            "itemCode": "RDM1",
            "responseValue": "1"
          },
          {
            "itemCode": "RDM2",
            "responseValue": "1"
          },
          {
            "itemCode": "RDM3",
            "responseValue": "1"
          },
          {
            "itemCode": "RDM4",
            "responseValue": "1"
          },
          {
            "itemCode": "RDM5",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_awareness": 1,
            "social_awareness": 1,
            "self_management": 1,
            "relationship_management": 1,
            "responsible_decision_making": 1
          },
          "totalScoreKeys": [
            "self_awareness",
            "social_awareness",
            "self_management",
            "relationship_management",
            "responsible_decision_making"
          ]
        }
      },
      {
        "name": "all-maximum",
        "answers": [
          {
            "itemCode": "SA1",
            "responseValue": "6"
          },
          {
            "itemCode": "SA2",
            "responseValue": "6"
          },
          {
            "itemCode": "SA3",
            "responseValue": "6"
          },
          {
            "itemCode": "SA4",
            "responseValue": "6"
          },
          {
            "itemCode": "SA5",
            "responseValue": "6"
          },
          {
            "itemCode": "SoA1",
            "responseValue": "6"
          },
          {
            "itemCode": "SoA2",
            "responseValue": "6"
          },
          {
            "itemCode": "SoA3",
            "responseValue": "6"
          },
          {
            "itemCode": "SoA4",
            "responseValue": "6"
          },
          {
            "itemCode": "SoA5",
            "responseValue": "6"
          },
          {
            "itemCode": "SM1",
            "responseValue": "6"
          },
          {
            "itemCode": "SM2",
            "responseValue": "6"
          },
          {
            "itemCode": "SM3",
            "responseValue": "6"
          },
          {
            "itemCode": "SM4",
            "responseValue": "6"
          },
          {
            "itemCode": "SM5",
            "responseValue": "6"
          },
          {
            "itemCode": "RM1",
            "responseValue": "6"
          },
          {
            "itemCode": "RM2",
            "responseValue": "6"
          },
          {
            "itemCode": "RM3",
            "responseValue": "6"
          },
          {
            "itemCode": "RM4",
            "responseValue": "6"
          },
          {
            "itemCode": "RM5",
            "responseValue": "6"
          },
          {
            "itemCode": "RDM1",
            "responseValue": "6"
          },
          {
            "itemCode": "RDM2",
            "responseValue": "6"
          },
          {
            "itemCode": "RDM3",
            "responseValue": "6"
          },
          {
            "itemCode": "RDM4",
            "responseValue": "6"
          },
          {
            "itemCode": "RDM5",
            "responseValue": "6"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_awareness": 6,
            "social_awareness": 6,
            "self_management": 6,
            "relationship_management": 6,
            "responsible_decision_making": 6
          },
          "totalScoreKeys": [
            "self_awareness",
            "social_awareness",
            "self_management",
            "relationship_management",
            "responsible_decision_making"
          ]
        }
      },
      {
        "name": "missing-sa5",
        "answers": [
          {
            "itemCode": "SA1",
            "responseValue": "4"
          },
          {
            "itemCode": "SA2",
            "responseValue": "4"
          },
          {
            "itemCode": "SA3",
            "responseValue": "4"
          },
          {
            "itemCode": "SA4",
            "responseValue": "4"
          },
          {
            "itemCode": "SoA1",
            "responseValue": "4"
          },
          {
            "itemCode": "SoA2",
            "responseValue": "4"
          },
          {
            "itemCode": "SoA3",
            "responseValue": "4"
          },
          {
            "itemCode": "SoA4",
            "responseValue": "4"
          },
          {
            "itemCode": "SoA5",
            "responseValue": "4"
          },
          {
            "itemCode": "SM1",
            "responseValue": "4"
          },
          {
            "itemCode": "SM2",
            "responseValue": "4"
          },
          {
            "itemCode": "SM3",
            "responseValue": "4"
          },
          {
            "itemCode": "SM4",
            "responseValue": "4"
          },
          {
            "itemCode": "SM5",
            "responseValue": "4"
          },
          {
            "itemCode": "RM1",
            "responseValue": "4"
          },
          {
            "itemCode": "RM2",
            "responseValue": "4"
          },
          {
            "itemCode": "RM3",
            "responseValue": "4"
          },
          {
            "itemCode": "RM4",
            "responseValue": "4"
          },
          {
            "itemCode": "RM5",
            "responseValue": "4"
          },
          {
            "itemCode": "RDM1",
            "responseValue": "4"
          },
          {
            "itemCode": "RDM2",
            "responseValue": "4"
          },
          {
            "itemCode": "RDM3",
            "responseValue": "4"
          },
          {
            "itemCode": "RDM4",
            "responseValue": "4"
          },
          {
            "itemCode": "RDM5",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "self_awareness": null,
            "social_awareness": 4,
            "self_management": 4,
            "relationship_management": 4,
            "responsible_decision_making": 4
          },
          "totalScoreKeys": [
            "self_awareness",
            "social_awareness",
            "self_management",
            "relationship_management",
            "responsible_decision_making"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
