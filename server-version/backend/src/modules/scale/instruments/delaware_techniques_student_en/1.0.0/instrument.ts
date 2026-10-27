import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "delaware_techniques_student_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Delaware Positive, Punitive, and Social Emotional Learning Techniques Scale — Student",
      "abbreviation": "DTS-S",
      "instrumentFamily": "Delaware School Surveys"
    },
    "construct": {
      "primaryDomain": "SCHOOL_CLIMATE",
      "secondaryDomains": [
        "SOCIAL_EMOTIONAL"
      ],
      "constructDefinition": "学生对学校正向行为、惩罚及社会情绪学习做法的感知，不是学生的个人能力。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:sel_context", "population:k12", "response:student_self", "response:student_perception", "use:reflection", "use:research", "language_validation:english_original", "construct:sel_delaware_techniques_positive", "construct:sel_delaware_techniques_punitive", "construct:sel_delaware_techniques_sel", 
        "school_practices",
        "positive_techniques",
        "punitive_techniques",
        "sel_techniques",
        "student_perspective"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "学生自评，来源为三至五年级问卷；需与教师版区分。"
    },
    "administration": {
      "itemCount": 16,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "本学年",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保持学生版原始题序和同意度；三个做法分维分开呈现，不合并总分。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "PROGRAM_EVALUATION",
          "evidenceStatus": "SUPPORTED",
          "notes": "学校需求评估与改进应以群体信息及其他证据为基础。"
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
    "policyVersion": "dts-student-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "dts-student-en-v1",
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
    "text": "Please read each statement and mark the response that best shows how much you agree. In this school…",
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
        "title": "Delaware Positive, Punitive, and SEL Techniques Scale — Student",
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
          "key": "dscs_agreement",
          "options": [
            {
              "value": "1",
              "label": "Disagree a lot",
              "score": 1
            },
            {
              "value": "2",
              "label": "Disagree",
              "score": 2
            },
            {
              "value": "3",
              "label": "Agree",
              "score": 3
            },
            {
              "value": "4",
              "label": "Agree a lot",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "DTS-01",
          "content": "Students are punished a lot.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-02",
          "content": "Students are praised often.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-03",
          "content": "Students are taught to feel responsible for how they act.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-04",
          "content": "Students are often sent out of class for breaking rules.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-05",
          "content": "Students are often given rewards for being good.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-06",
          "content": "Students are taught to understand how others think and feel.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-07",
          "content": "Students are often yelled at by adults.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-08",
          "content": "Teachers often let students know when they are being good.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-09",
          "content": "Students are taught that they can control their own behavior.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-10",
          "content": "Many students are sent to the office for breaking rules.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-11",
          "content": "Classes get rewards for good behavior.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-12",
          "content": "Students are taught how to solve conflicts with others.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-13",
          "content": "Students are punished too much for minor things.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-14",
          "content": "Teachers use just enough praise and rewards; not too much or too little.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-15",
          "content": "Students are taught they should care about how others feel.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DTS-16",
          "content": "Students are often asked to help decide what is best for the class or school.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "DTS-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DTS-16",
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
            "key": "positive",
            "type": "dimension",
            "label": "正向行为做法",
            "description": "该领域原始回答的平均值。",
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
                  "itemCode": "DTS-02",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-05",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-08",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-11",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-14",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "punitive",
            "type": "dimension",
            "label": "惩罚性做法",
            "description": "该领域原始回答的平均值。",
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
                  "itemCode": "DTS-01",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-04",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-07",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-10",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-13",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "sel",
            "type": "dimension",
            "label": "社会情绪学习做法",
            "description": "该领域原始回答的平均值。",
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
                  "itemCode": "DTS-03",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-06",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-09",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-12",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-15",
                  "weight": 1
                },
                {
                  "itemCode": "DTS-16",
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
          "positive",
          "punitive",
          "sel"
        ],
        "scoreOrder": [
          "positive",
          "punitive",
          "sel"
        ],
        "interpretations": [
          {
            "scoreKey": "positive",
            "headline": "正向行为做法",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及学生对表扬和奖励等做法的感受。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "问问学生：怎样的认可让他们感到被看见？也关注奖励的适当性。"
              }
            ]
          },
          {
            "scoreKey": "punitive",
            "headline": "惩罚性做法",
            "source": {
              "type": "score_only"
            },
            "summary": "数值越高表示越同意学校使用这些惩罚性做法；它不是个人行为问题的分数。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "了解学生在纪律处理中的经历，并结合学校记录讨论更有支持性的回应。"
              }
            ]
          },
          {
            "scoreKey": "sel",
            "headline": "社会情绪学习做法",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及学生是否感受到有关责任、理解他人和解决冲突的教学。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "邀请学生分享哪些练习有帮助，以及他们希望如何参与班级决定。"
              }
            ]
          }
        ],
        "limitations": [
          "这是单个学生对学校做法的感受，不能直接当作学校整体结论。",
          "三个领域分别展示，惩罚性做法保持原始方向，不构造总分。",
          "没有适用的常模比较或诊断阈值。"
        ],
        "disclaimer": "用这些线索倾听学生并支持学校改进，不用于给学生或教师排名。"
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
            "itemCode": "DTS-01",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-06",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-08",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-15",
            "responseValue": "1"
          },
          {
            "itemCode": "DTS-16",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "positive": 1,
            "punitive": 1,
            "sel": 1
          },
          "totalScoreKeys": [
            "positive",
            "punitive",
            "sel"
          ]
        }
      },
      {
        "name": "all-4",
        "answers": [
          {
            "itemCode": "DTS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-02",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-03",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-04",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-08",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-10",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-14",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-15",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-16",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "positive": 4,
            "punitive": 4,
            "sel": 4
          },
          "totalScoreKeys": [
            "positive",
            "punitive",
            "sel"
          ]
        }
      },
      {
        "name": "report-sample",
        "answers": [
          {
            "itemCode": "DTS-01",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-03",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-04",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-05",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-07",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-10",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-11",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-13",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-14",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-15",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-16",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "positive": 3,
            "punitive": 2,
            "sel": 4
          },
          "totalScoreKeys": [
            "positive",
            "punitive",
            "sel"
          ]
        }
      },
      {
        "name": "missing-first",
        "answers": [
          {
            "itemCode": "DTS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-03",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-04",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-05",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-07",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-10",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-11",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-13",
            "responseValue": "2"
          },
          {
            "itemCode": "DTS-14",
            "responseValue": "3"
          },
          {
            "itemCode": "DTS-15",
            "responseValue": "4"
          },
          {
            "itemCode": "DTS-16",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "positive": 3,
            "punitive": null,
            "sel": 4
          },
          "totalScoreKeys": [
            "positive",
            "punitive",
            "sel"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
