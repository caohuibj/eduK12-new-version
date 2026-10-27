import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'
import { delawareClimateScorer } from './scorer'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "delaware_school_climate_student_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Delaware School Climate Scale — Student, 2020",
      "abbreviation": "DSCS-S",
      "instrumentFamily": "Delaware School Surveys"
    },
    "construct": {
      "primaryDomain": "SCHOOL_CLIMATE",
      "secondaryDomains": [
        "SCHOOL_BELONGING"
      ],
      "constructDefinition": "学生对学校环境与关系、规则、公平、安全、参与和校园欺凌的感知，不是学生个人社会情绪能力测量。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": ["domain:sel", "license:author_contact_required", "license:redistribution_review_pending", "domain:sel_context", "population:k12", "response:student_self", "response:student_perception", "use:reflection", "use:research", "language_validation:english_original", "construct:sel_delaware_climate_teacher_student", "construct:sel_delaware_climate_student_student", "construct:sel_delaware_climate_engagement", "construct:sel_delaware_climate_clarity", "construct:sel_delaware_climate_fairness", "construct:sel_delaware_climate_safety", "construct:sel_delaware_climate_bullying", 
        "school_climate",
        "student_perspective",
        "school_safety",
        "bullying",
        "school_improvement"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "来源问卷为三至五年级；六至十二年级另有版本。"
    },
    "administration": {
      "itemCount": 31,
      "estimatedMinutes": 12,
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
        "第31题为原始真实性检查，不参与任何内容得分；本单量表缺少第二道检查题，不能宣称完成手册的完整有效性筛查。",
        "Bullying subscale stays in its original direction; total reverses items 9, 14 and 26 and sums all 30 content items."
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
    "policyVersion": "dscs-student-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "dscs-student-en-v1",
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
    "text": "This survey is about how you feel about your school this year. Please read each statement and select the response that best shows how much you agree.",
    "language": "en",
    "version": "1.0.0",
    "source": "Adapted from Delaware School Surveys Technical Manual (2021), Appendix B."
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Delaware School Climate Survey—Student, Grades 3–5",
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
          "itemCode": "DSCS-01",
          "content": "Most students turn in their homework on time.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-02",
          "content": "Teachers treat students of all races with respect.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-03",
          "content": "The school rules are fair.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-04",
          "content": "Students are safe in the hallways.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-05",
          "content": "Rules are made clear to students.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-06",
          "content": "Most students try their best.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-07",
          "content": "Teachers care about their students.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-08",
          "content": "The consequences of breaking rules are fair.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-09",
          "content": "Students threaten and bully others.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-10",
          "content": "Students know how they are expected to act.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-11",
          "content": "Students are friendly with each other.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-12",
          "content": "Most students feel happy.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-13",
          "content": "Students feel safe.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-14",
          "content": "Students worry about others bullying them.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-15",
          "content": "Students know what the rules are.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-16",
          "content": "Students care about each other.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-17",
          "content": "Teachers listen to students when they have problems.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-18",
          "content": "The school’s Code of Conduct is fair.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-19",
          "content": "Students know they are safe in this school.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-20",
          "content": "It is clear how students are expected to act.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-21",
          "content": "Students respect others who are different.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-22",
          "content": "Adults who work here care about the students.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-23",
          "content": "Most students follow the rules.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-24",
          "content": "Most students like this school.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-25",
          "content": "Teachers like their students.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-26",
          "content": "Students bully one another.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-27",
          "content": "Classroom rules are fair.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-28",
          "content": "Most students work hard to get good grades.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-29",
          "content": "Students treat each other with respect.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-30",
          "content": "Students get along with each other.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        },
        {
          "itemCode": "DSCS-31",
          "content": "I am lying on this survey.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "dscs_agreement",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "DSCS-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DSCS-31",
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
            "label": "Teacher–student relationships",
            "description": "Mean of the responses in this area.",
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
                  "itemCode": "DSCS-02",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-07",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-17",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-22",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-25",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            },
            "range": {
              "min": 1,
              "max": 4
            }
          },
          {
            "key": "student_student",
            "type": "dimension",
            "label": "Student–student relationships",
            "description": "Mean of the responses in this area.",
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
                  "itemCode": "DSCS-11",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-16",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-21",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-29",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-30",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            },
            "range": {
              "min": 1,
              "max": 4
            }
          },
          {
            "key": "engagement",
            "type": "dimension",
            "label": "Schoolwide engagement",
            "description": "Mean of the responses in this area.",
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
                  "itemCode": "DSCS-01",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-06",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-12",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-23",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-24",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-28",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            },
            "range": {
              "min": 1,
              "max": 4
            }
          },
          {
            "key": "clarity",
            "type": "dimension",
            "label": "Clarity of expectations",
            "description": "Mean of the responses in this area.",
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
                  "itemCode": "DSCS-05",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-10",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-15",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-20",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            },
            "range": {
              "min": 1,
              "max": 4
            }
          },
          {
            "key": "fairness",
            "type": "dimension",
            "label": "Fairness of rules",
            "description": "Mean of the responses in this area.",
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
                  "itemCode": "DSCS-03",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-08",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-18",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-27",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            },
            "range": {
              "min": 1,
              "max": 4
            }
          },
          {
            "key": "safety",
            "type": "dimension",
            "label": "School safety",
            "description": "Mean of the responses in this area.",
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
                  "itemCode": "DSCS-04",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-13",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-19",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            },
            "range": {
              "min": 1,
              "max": 4
            }
          },
          {
            "key": "bullying",
            "type": "dimension",
            "label": "Schoolwide bullying",
            "description": "Mean of the responses in this area.",
            "direction": "higher_is_worse",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "DSCS-09",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-14",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-26",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            },
            "range": {
              "min": 1,
              "max": 4
            }
          },
          {
            "key": "climate_total",
            "type": "total",
            "label": "Total School Climate",
            "description": "Sum of all 30 climate items, reversing bullying items 9, 14 and 26; range 30–120.",
            "direction": "higher_is_more",
            "canonical": true,
            "displayPrecision": 0,
            "range": {
              "min": 30,
              "max": 120
            },
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "DSCS-01",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-02",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-03",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-04",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-05",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-06",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-07",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-08",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-09",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-10",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-11",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-12",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-13",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-14",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-15",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-16",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-17",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-18",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-19",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-20",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-21",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-22",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-23",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-24",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-25",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-26",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-27",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-28",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-29",
                  "weight": 1
                },
                {
                  "itemCode": "DSCS-30",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          }
        ],
        "scorerKey": "delaware_climate_2020_v1"
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "climate_total"
        ],
        "scoreOrder": [
          "teacher_student",
          "student_student",
          "engagement",
          "clarity",
          "fairness",
          "safety",
          "bullying",
          "climate_total"
        ],
        "interpretations": [
          {
            "scoreKey": "teacher_student",
            "headline": "Teacher–student relationships",
            "source": {
              "type": "score_only"
            },
            "summary": "How do students experience care and listening from adults?",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Invite students to identify safe ways to seek help and notice whether adults follow up."
              }
            ]
          },
          {
            "scoreKey": "student_student",
            "headline": "Student–student relationships",
            "source": {
              "type": "score_only"
            },
            "summary": "How do students experience respect and belonging among peers?",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Ask students what helps them feel welcomed and use their ideas to shape group activities."
              }
            ]
          },
          {
            "scoreKey": "engagement",
            "headline": "Schoolwide engagement",
            "source": {
              "type": "score_only"
            },
            "summary": "These answers describe perceptions of engagement across the school.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Explore with students what makes learning meaningful and what barriers make participation harder."
              }
            ]
          },
          {
            "scoreKey": "clarity",
            "headline": "Clarity of expectations",
            "source": {
              "type": "score_only"
            },
            "summary": "How clear do students find the school’s expectations?",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Review expectations with students and ask them to explain how those expectations work in practice."
              }
            ]
          },
          {
            "scoreKey": "fairness",
            "headline": "Fairness of rules",
            "source": {
              "type": "score_only"
            },
            "summary": "Do students experience rules and consequences as fair?",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Gather student perspectives on how rules are applied and identify patterns to examine."
              }
            ]
          },
          {
            "scoreKey": "safety",
            "headline": "School safety",
            "source": {
              "type": "score_only"
            },
            "summary": "How safe do students perceive the school to be?",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Ask where and when students feel less safe and develop a response with trusted adults."
              }
            ]
          },
          {
            "scoreKey": "bullying",
            "headline": "Schoolwide bullying",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher values mean more agreement that bullying or worry about bullying occurs.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Listen without blame; offer clear, accessible ways to seek support and address patterns."
              }
            ]
          },
          {
            "scoreKey": "climate_total",
            "headline": "Total school climate",
            "source": {
              "type": "score_only"
            },
            "summary": "This sum combines the 30 climate responses. The three bullying responses are reversed for this total; a higher total means more positive reported climate. One student’s total is not a school average.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Combine a suitable group summary with student voice and other evidence to identify one area for school improvement."
              }
            ]
          }
        ],
        "limitations": [
          "This is one student’s perception, not a school-level estimate. School improvement requires a suitable group summary and other evidence.",
          "The bullying dimension runs in the opposite direction: higher means more perceived bullying or worry.",
          "Item 31 is excluded from content scores. The manual’s full validity screen also requires a second item from another scale; this stand-alone form does not implement it.",
          "This form has no normative comparison or diagnosis."
        ],
        "disclaimer": "Use this feedback to support listening and school improvement; do not use it to rank students or staff."
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
            "itemCode": "DSCS-01",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-06",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-08",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-15",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-16",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-17",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-18",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-19",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-20",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-21",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-22",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-23",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-24",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-25",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-26",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-27",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-28",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-29",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-30",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-31",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "teacher_student": 1,
            "student_student": 1,
            "engagement": 1,
            "clarity": 1,
            "fairness": 1,
            "safety": 1,
            "bullying": 1,
            "climate_total": 39
          },
          "totalScoreKeys": [
            "teacher_student",
            "student_student",
            "engagement",
            "clarity",
            "fairness",
            "safety",
            "bullying",
            "climate_total"
          ]
        }
      },
      {
        "name": "all-4",
        "answers": [
          {
            "itemCode": "DSCS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-02",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-03",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-04",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-08",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-10",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-14",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-15",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-16",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-17",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-18",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-19",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-20",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-21",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-22",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-23",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-24",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-25",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-26",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-27",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-28",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-29",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-30",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-31",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "teacher_student": 4,
            "student_student": 4,
            "engagement": 4,
            "clarity": 4,
            "fairness": 4,
            "safety": 4,
            "bullying": 4,
            "climate_total": 111
          },
          "totalScoreKeys": [
            "teacher_student",
            "student_student",
            "engagement",
            "clarity",
            "fairness",
            "safety",
            "bullying",
            "climate_total"
          ]
        }
      },
      {
        "name": "negative-direction",
        "answers": [
          {
            "itemCode": "DSCS-01",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-03",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-04",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-05",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-07",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-11",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-12",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-13",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-15",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-16",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-17",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-18",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-19",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-20",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-21",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-22",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-23",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-24",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-25",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-26",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-27",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-28",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-29",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-30",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-31",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "teacher_student": 3,
            "student_student": 3,
            "engagement": 3,
            "clarity": 3,
            "fairness": 3,
            "safety": 3,
            "bullying": 1,
            "climate_total": 93
          },
          "totalScoreKeys": [
            "teacher_student",
            "student_student",
            "engagement",
            "clarity",
            "fairness",
            "safety",
            "bullying",
            "climate_total"
          ]
        }
      },
      {
        "name": "missing-teacher-25",
        "answers": [
          {
            "itemCode": "DSCS-01",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-03",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-04",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-05",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-07",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-08",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-11",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-12",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-13",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-15",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-16",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-17",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-18",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-19",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-20",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-21",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-22",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-23",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-24",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-26",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-27",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-28",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-29",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-30",
            "responseValue": "3"
          },
          {
            "itemCode": "DSCS-31",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "teacher_student": null,
            "student_student": 3,
            "engagement": 3,
            "clarity": 3,
            "fairness": 3,
            "safety": 3,
            "bullying": 1,
            "climate_total": null
          },
          "totalScoreKeys": [
            "teacher_student",
            "student_student",
            "engagement",
            "clarity",
            "fairness",
            "safety",
            "bullying",
            "climate_total"
          ]
        }
      },
      {
        "name": "total-max",
        "answers": [
          {
            "itemCode": "DSCS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-02",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-03",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-04",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-08",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-10",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-15",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-16",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-17",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-18",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-19",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-20",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-21",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-22",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-23",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-24",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-25",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-26",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-27",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-28",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-29",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-30",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-31",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "teacher_student": 4,
            "student_student": 4,
            "engagement": 4,
            "clarity": 4,
            "fairness": 4,
            "safety": 4,
            "bullying": 1,
            "climate_total": 120
          },
          "totalScoreKeys": [
            "teacher_student",
            "student_student",
            "engagement",
            "clarity",
            "fairness",
            "safety",
            "bullying",
            "climate_total"
          ]
        }
      },
      {
        "name": "total-min",
        "answers": [
          {
            "itemCode": "DSCS-01",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-02",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-03",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-04",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-05",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-06",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-07",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-08",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-10",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-11",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-12",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-13",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-14",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-15",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-16",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-17",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-18",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-19",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-20",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-21",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-22",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-23",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-24",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-25",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-26",
            "responseValue": "4"
          },
          {
            "itemCode": "DSCS-27",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-28",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-29",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-30",
            "responseValue": "1"
          },
          {
            "itemCode": "DSCS-31",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "teacher_student": 1,
            "student_student": 1,
            "engagement": 1,
            "clarity": 1,
            "fairness": 1,
            "safety": 1,
            "bullying": 4,
            "climate_total": 30
          },
          "totalScoreKeys": [
            "teacher_student",
            "student_student",
            "engagement",
            "clarity",
            "fairness",
            "safety",
            "bullying",
            "climate_total"
          ]
        }
      }
    ],
    "scorerPlugins": [
      { key: 'delaware_climate_2020_v1', version: '1.0.0', scorer: delawareClimateScorer }
    ]
  }
} satisfies ScaleInstrumentSourceV1
