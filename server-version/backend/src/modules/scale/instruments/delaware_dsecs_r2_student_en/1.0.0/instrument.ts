import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "delaware_dsecs_r2_student_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Delaware Social and Emotional Competencies Scale — Student, Revision 2",
      "abbreviation": "DSECS-R2",
      "instrumentFamily": "Delaware School Surveys"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "SELF_REGULATION"
      ],
      "constructDefinition": "学生自评五个社会情绪能力相关领域。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "orientation:casel", "population:k12", "response:student_self", "use:reflection", "use:research", "language_validation:english_original", "construct:sel_dsecs_r2_responsible_decision_making", "construct:sel_dsecs_r2_social_awareness", "construct:sel_dsecs_r2_self_management", "construct:sel_dsecs_r2_relationship_skills", "construct:sel_dsecs_r2_self_awareness", 
        "self_awareness",
        "self_management",
        "social_awareness",
        "relationship_skills",
        "responsible_decision_making",
        "self_report"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "学生自评，手册适用于三至十二年级。"
    },
    "administration": {
      "itemCount": 20,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般自我描述",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留附录 B/C 学生实表题序与四级像我程度。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "描述性自我探索，不提供常模等级。"
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
    "evidence": [],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "dsecs-r2-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "dsecs-r2-v1",
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
      }
    },
    "unknownAudience": "DENY"
  },
  "instruction": {
    "schemaVersion": 1,
    "text": "Please read each statement and mark the response that best shows how much it is like you.",
    "language": "en",
    "version": "1.0.0",
    "source": "Delaware School Surveys Technical Manual (2021), Appendix B."
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Delaware Social and Emotional Competencies Scale — Student, Revision 2",
        "citation": "Bear GG, Yang C, Soltys A, Litwa L, Hearn S, Boyer D. Technical Manual for the Delaware School Survey, 2021, Appendix B.",
        "url": "https://cdn.secondstep.org/static/pdf/dsecs-s-technical-guide.pdf",
        "publicationYear": 2021
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "Manual states the scales are free to the public and schools may administer them themselves. No explicit source redistribution or adaptation licence was found."
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "dsecs_likeness",
          "options": [
            {
              "value": "1",
              "label": "Not like me at all",
              "score": 1
            },
            {
              "value": "2",
              "label": "Not much like me",
              "score": 2
            },
            {
              "value": "3",
              "label": "Somewhat like me",
              "score": 3
            },
            {
              "value": "4",
              "label": "Very much like me",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "DSECS-01",
          "content": "I feel responsible for how I act.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-02",
          "content": "I think about how others feel.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-03",
          "content": "I can control how I behave.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-04",
          "content": "I am good at solving conflicts with others.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-05",
          "content": "I know what I do well and not well.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-06",
          "content": "I am good at deciding right from wrong.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-07",
          "content": "I care about how others feel.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-08",
          "content": "I think before I act.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-09",
          "content": "I get along well with others.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-10",
          "content": "When I work harder, I do better.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-11",
          "content": "I make good decisions.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-12",
          "content": "I respect what others think.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-13",
          "content": "I can control my anger.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-14",
          "content": "I am kind to others.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-15",
          "content": "I try to understand how I feel.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-16",
          "content": "I think about the consequences of what I do.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-17",
          "content": "I try to understand how others think and feel.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-18",
          "content": "I can calm myself when upset.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-19",
          "content": "I help others.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSECS-20",
          "content": "There are things that I am good at.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "dsecs_likeness",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "DSECS-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSECS-20",
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
            "key": "responsible_decision_making",
            "type": "dimension",
            "label": "负责决策",
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
                  "itemCode": "DSECS-01",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-06",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-11",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-16",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "social_awareness",
            "type": "dimension",
            "label": "社会意识",
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
                  "itemCode": "DSECS-02",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-07",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-12",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-17",
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
                  "itemCode": "DSECS-03",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-08",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-13",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-18",
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
                  "itemCode": "DSECS-04",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-09",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-14",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-19",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "self_awareness",
            "type": "dimension",
            "label": "自我意识",
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
                  "itemCode": "DSECS-05",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-10",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-15",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-20",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "overall",
            "type": "total",
            "label": "总体自我描述",
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
                  "itemCode": "DSECS-01",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-02",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-03",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-04",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-05",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-06",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-07",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-08",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-09",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-10",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-11",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-12",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-13",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-14",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-15",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-16",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-17",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-18",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-19",
                  "weight": 1
                },
                {
                  "itemCode": "DSECS-20",
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
          "responsible_decision_making",
          "social_awareness",
          "self_management",
          "relationship_skills",
          "self_awareness",
          "overall"
        ],
        "interpretations": [
          {
            "scoreKey": "responsible_decision_making",
            "headline": "负责决策",
            "source": {
              "type": "score_only"
            },
            "summary": "你对自己做选择和承担行动后果的回答形成这一线索。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "想一想：做决定前，能否先问问自己可能发生什么？"
              }
            ]
          },
          {
            "scoreKey": "social_awareness",
            "headline": "社会意识",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及留意他人的感受和想法。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "试试看：不确定别人怎么想时，找机会耐心问一问。"
              }
            ]
          },
          {
            "scoreKey": "self_management",
            "headline": "自我管理",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及行动前思考，以及在情绪起伏时安顿自己。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "当情绪强烈时，什么能帮助你停一停？"
              }
            ]
          },
          {
            "scoreKey": "relationship_skills",
            "headline": "人际关系技能",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及与别人相处、友善和解决冲突。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想一次相处愉快的经历：你做了什么让沟通更容易？"
              }
            ]
          },
          {
            "scoreKey": "self_awareness",
            "headline": "自我意识",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及认识自己的感受、长处和需要努力的地方。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "写下一件最近做得不错的小事，以及你希望继续练习的事。"
              }
            ]
          },
          {
            "scoreKey": "overall",
            "headline": "总体自我描述",
            "source": {
              "type": "score_only"
            },
            "summary": "20题的平均回答描述这次自我观察；它不能定义你的全部。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "从五个方面中选一个你愿意继续探索的小行动。"
              }
            ]
          }
        ],
        "limitations": [
          "这是学生自评，反映一次自我描述，不是客观能力测试。",
          "没有适用于你的常模或诊断阈值。",
          "英文原文来源公开手册，反馈为中文工作内容，非已验证中文题本。"
        ],
        "disclaimer": "这份报告帮助你反思，不用于诊断或给人排名。"
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
            "itemCode": "DSECS-01",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-06",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-08",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-15",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-16",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-17",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-18",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-19",
            "responseValue": "1"
          },
          {
            "itemCode": "DSECS-20",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "responsible_decision_making": 1,
            "social_awareness": 1,
            "self_management": 1,
            "relationship_skills": 1,
            "self_awareness": 1,
            "overall": 1
          },
          "totalScoreKeys": [
            "responsible_decision_making",
            "social_awareness",
            "self_management",
            "relationship_skills",
            "self_awareness",
            "overall"
          ]
        }
      },
      {
        "name": "all-4",
        "answers": [
          {
            "itemCode": "DSECS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-02",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-03",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-04",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-08",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-10",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-14",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-15",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-16",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-17",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-18",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-19",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-20",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "responsible_decision_making": 4,
            "social_awareness": 4,
            "self_management": 4,
            "relationship_skills": 4,
            "self_awareness": 4,
            "overall": 4
          },
          "totalScoreKeys": [
            "responsible_decision_making",
            "social_awareness",
            "self_management",
            "relationship_skills",
            "self_awareness",
            "overall"
          ]
        }
      },
      {
        "name": "report-sample",
        "answers": [
          {
            "itemCode": "DSECS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-02",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-03",
            "responseValue": "2"
          },
          {
            "itemCode": "DSECS-04",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-05",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-09",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-11",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-12",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-13",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-14",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-15",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-16",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-17",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-18",
            "responseValue": "2"
          },
          {
            "itemCode": "DSECS-19",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-20",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "responsible_decision_making": 3.25,
            "social_awareness": 3.5,
            "self_management": 2.5,
            "relationship_skills": 3,
            "self_awareness": 2.75,
            "overall": 3
          },
          "totalScoreKeys": [
            "responsible_decision_making",
            "social_awareness",
            "self_management",
            "relationship_skills",
            "self_awareness",
            "overall"
          ]
        }
      },
      {
        "name": "missing-one",
        "answers": [
          {
            "itemCode": "DSECS-02",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-03",
            "responseValue": "2"
          },
          {
            "itemCode": "DSECS-04",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-05",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "DSECS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-09",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-11",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-12",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-13",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-14",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-15",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-16",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-17",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-18",
            "responseValue": "2"
          },
          {
            "itemCode": "DSECS-19",
            "responseValue": "3"
          },
          {
            "itemCode": "DSECS-20",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "responsible_decision_making": null,
            "social_awareness": 3.5,
            "self_management": 2.5,
            "relationship_skills": 3,
            "self_awareness": 2.75,
            "overall": null
          },
          "totalScoreKeys": [
            "responsible_decision_making",
            "social_awareness",
            "self_management",
            "relationship_skills",
            "self_awareness",
            "overall"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
