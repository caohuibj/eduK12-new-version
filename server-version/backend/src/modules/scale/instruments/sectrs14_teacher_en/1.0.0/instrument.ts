import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "sectrs14_teacher_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Social-Emotional Competence Teacher Rating Scale — 14-item",
      "abbreviation": "SECTRS-14",
      "instrumentFamily": "SECTRS"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "SELF_REGULATION"
      ],
      "constructDefinition": "教师对个人社会情绪能力的四个相关方面的自我描述。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:social_emotional_competence", "population:teachers", "response:teacher_self", "use:reflection", "use:research", "language_validation:english_original", "license:noncommercial", "construct:sel_sectrs14_teacher_student", "construct:sel_sectrs14_emotion_regulation", "construct:sel_sectrs14_social_awareness", "construct:sel_sectrs14_interpersonal", 
        "teacher_student_relationships",
        "emotion_regulation",
        "social_awareness",
        "interpersonal_relationships",
        "teacher_self_report"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "UNKNOWN",
      "populationNotes": "教师自评；研究样本来自意大利、拉脱维亚及葡萄牙，未建立完全标量等值。"
    },
    "administration": {
      "itemCount": 14,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "日常课堂及学校情境",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "14题、六级同意度；四因子独立解释。附录最高选项误印为不同意，依正文更正为强烈同意。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "描述性自我反思；不作跨国比较或高风险决策。"
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
        "evidenceId": "sectrs14-grazzani-2024",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "572 teachers from Italy, Latvia, and Portugal",
        "locale": "en",
        "territory": "IT",
        "studyDesign": "Four-factor teacher self-report model with cross-country invariance assessment.",
        "rating": "MIXED",
        "citation": "Grazzani I, Martinsone B, Simões C, Cavioni V, Conte E, Ornaghi V, Pepe A. Assessing teachers' social and emotional competence: The validation of SECTRS in Italy, Latvia, and Portugal. International Journal of Emotional Education. 2024;16(1):70–87.",
        "doi": "10.56300/QIAN8168",
        "url": "https://files.eric.ed.gov/fulltext/EJ1422263.pdf",
        "notes": "Samples span three countries; full scalar invariance was not established."
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "sectrs14-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "sectrs14-en-v1",
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
    "text": "The statements below describe your thoughts, feelings, and actions in the classroom and in situations at your school. For each item, please indicate the extent to which you agree or disagree with the statement provided. There are no right or wrong answers, so please be as honest as possible.",
    "language": "en",
    "version": "1.0.0",
    "source": "Grazzani et al. (2024), Appendix 1, https://doi.org/10.56300/QIAN8168"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "SECTRS-14",
        "citation": "Grazzani et al. (2024), Assessing teachers' social and emotional competence, International Journal of Emotional Education 16(1):70–87.",
        "url": "https://doi.org/10.56300/QIAN8168",
        "publicationYear": 2024
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "Journal states all articles are CC BY-NC-ND 4.0 (https://creativecommons.org/licenses/by-nc-nd/4.0/); 14 English items transcribed from Grazzani et al. (2024), Appendix 1, doi:10.56300/QIAN8168. Original instrument rights and commercial deployment rights are not confirmed. Response option 6 corrected from appendix misprint following the article text."
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "sectrs_agreement",
          "options": [
            {
              "value": "1",
              "label": "Strongly Disagree",
              "score": 1
            },
            {
              "value": "2",
              "label": "Disagree",
              "score": 2
            },
            {
              "value": "3",
              "label": "Somewhat Disagree",
              "score": 3
            },
            {
              "value": "4",
              "label": "Somewhat agree",
              "score": 4
            },
            {
              "value": "5",
              "label": "Agree",
              "score": 5
            },
            {
              "value": "6",
              "label": "Strongly Agree",
              "score": 6
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "SECTRS-01",
          "content": "I have a close relationship with my students.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-02",
          "content": "I nearly always stay calm when a student upsets me.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-03",
          "content": "My students' safety is an important factor in the decisions I make.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-04",
          "content": "Staff members seek my advice when resolving a problem.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-05",
          "content": "I am aware of how all of my students are feeling.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-06",
          "content": "I remain calm when addressing student misbehavior.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-07",
          "content": "I problem-solve with students when there is a problem or argument.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-08",
          "content": "I am good at understanding how my students' feel.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-09",
          "content": "Staff members at my school respect me.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-10",
          "content": "I create a sense of community in my classroom.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-11",
          "content": "I am able to manage my emotions and feelings in healthy ways.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-12",
          "content": "I consider my students' well-being when making decisions.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-13",
          "content": "I pay attention to the emotions of staff members at my school.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "SECTRS-14",
          "content": "I build positive relationships with my students' families.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "sectrs_agreement",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "SECTRS-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SECTRS-14",
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
            "key": "teacher_student",
            "type": "dimension",
            "label": "师生关系",
            "description": "完整作答时本维题目均值。",
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
                  "itemCode": "SECTRS-01",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-05",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-08",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-10",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-14",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "emotion_regulation",
            "type": "dimension",
            "label": "情绪调节",
            "description": "完整作答时本维题目均值。",
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
                  "itemCode": "SECTRS-02",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-06",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-11",
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
            "description": "完整作答时本维题目均值。",
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
                  "itemCode": "SECTRS-03",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-07",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-12",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "interpersonal",
            "type": "dimension",
            "label": "人际关系",
            "description": "完整作答时本维题目均值。",
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
                  "itemCode": "SECTRS-04",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-09",
                  "weight": 1
                },
                {
                  "itemCode": "SECTRS-13",
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
          "teacher_student",
          "emotion_regulation",
          "social_awareness",
          "interpersonal"
        ],
        "scoreOrder": [
          "teacher_student",
          "emotion_regulation",
          "social_awareness",
          "interpersonal"
        ],
        "interpretations": [
          {
            "scoreKey": "teacher_student",
            "headline": "师生关系",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及对学生感受的留意、班级关系与家庭沟通。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想一次让学生或家庭感到被听见的互动：哪些做法值得保留？"
              }
            ]
          },
          {
            "scoreKey": "emotion_regulation",
            "headline": "情绪调节",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及遇到挑战时的情绪调节。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "留意一个容易紧绷的时刻：什么支持能帮助您在回应前稍作停顿？"
              }
            ]
          },
          {
            "scoreKey": "social_awareness",
            "headline": "社会觉察",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答关注学生安全、福祉和与学生共同解决问题。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "下次作决定时，试着听取学生的视角，看看还有什么需要考虑。"
              }
            ]
          },
          {
            "scoreKey": "interpersonal",
            "headline": "人际关系",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回答涉及对同事情绪的关注以及与同事的互动。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "想一想：您希望在团队中得到怎样的支持？可以从哪一次对话开始？"
              }
            ]
          }
        ],
        "limitations": [
          "教师自评受情境和自我认识影响，不能替代观察或评价。",
          "跨三国未达到完全标量等值，不能据此比较群体。",
          "原研究部分维度信度较低，需结合具体经历解读。",
          "本版为英文原题，未提供经过验证的中文题本。"
        ],
        "disclaimer": "结果供个人反思，不用于教师排名或高风险评价。"
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
            "itemCode": "SECTRS-01",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-06",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-08",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "SECTRS-14",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "teacher_student": 1,
            "emotion_regulation": 1,
            "social_awareness": 1,
            "interpersonal": 1
          },
          "totalScoreKeys": [
            "teacher_student",
            "emotion_regulation",
            "social_awareness",
            "interpersonal"
          ]
        }
      },
      {
        "name": "all-6",
        "answers": [
          {
            "itemCode": "SECTRS-01",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-02",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-03",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-04",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-05",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-06",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-07",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-08",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-09",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-10",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-11",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-12",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-13",
            "responseValue": "6"
          },
          {
            "itemCode": "SECTRS-14",
            "responseValue": "6"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "teacher_student": 6,
            "emotion_regulation": 6,
            "social_awareness": 6,
            "interpersonal": 6
          },
          "totalScoreKeys": [
            "teacher_student",
            "emotion_regulation",
            "social_awareness",
            "interpersonal"
          ]
        }
      },
      {
        "name": "report-sample",
        "answers": [
          {
            "itemCode": "SECTRS-01",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "SECTRS-03",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-04",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-08",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-09",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-10",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-12",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-14",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "teacher_student": 4.6,
            "emotion_regulation": 3.6666666666666665,
            "social_awareness": 4.666666666666667,
            "interpersonal": 4.333333333333333
          },
          "totalScoreKeys": [
            "teacher_student",
            "emotion_regulation",
            "social_awareness",
            "interpersonal"
          ]
        }
      },
      {
        "name": "missing-first",
        "answers": [
          {
            "itemCode": "SECTRS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "SECTRS-03",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-04",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-08",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-09",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-10",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-12",
            "responseValue": "5"
          },
          {
            "itemCode": "SECTRS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "SECTRS-14",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "teacher_student": null,
            "emotion_regulation": 3.6666666666666665,
            "social_awareness": 4.666666666666667,
            "interpersonal": 4.333333333333333
          },
          "totalScoreKeys": [
            "teacher_student",
            "emotion_regulation",
            "social_awareness",
            "interpersonal"
          ]
        }
      }
    ]
  },
  "usageRequirements": {
    "schemaVersion": 1,
    "policyVersion": "sectrs14-en-v1",
    "requiredRightsActions": [
      "electronicAdministration",
      "scoring",
      "display"
    ],
    "allowedCommercialNatures": [
      "NON_COMMERCIAL"
    ],
    "notes": [
      "IJEE states that all its papers are licensed CC BY-NC-ND 4.0; noncommercial use only, attribution required; no claim of commercial or adaptation rights. Separate rights in the original instrument were not independently established."
    ]
  }
} satisfies ScaleInstrumentSourceV1
