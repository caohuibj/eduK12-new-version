import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text © 1996 M. M. Linehan, distributed via UW BRTC for noncommercial research/clinical/educational use.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "rfl48",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Reasons for Living Scale (48 items)",
      "abbreviation": "RFL",
      "instrumentFamily": "Reasons for Living Inventory"
    },
    "construct": {
      "primaryDomain": "WELL_BEING",
      "secondaryDomains": [
        "BEHAVIORAL_DIFFICULTIES"
      ],
      "constructDefinition": "自评面对自杀想法时维系生命的信念与保护性理由的强度。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:dbt",
        "construct:dbt_rfl_reasons_for_living",
        "protective_factors",
        "suicide_research_context",
        "adult_clinical_population",
        "self_report",
        "use:research",
        "language_validation:english_original",
        "license:rights_restricted_noncommercial",
        "subscale_structure_pending_verification"
      ]
    },
    "population": {
      "populationNotes": "原版开发基于成年精神科样本（Linehan et al., 1983）；未建立儿童青少年常模。含自杀相关内容，仅面向研究/临床情境施测，须配套专业支持流程；不得用于普通学生筛查、个体风险分级或 INDIVIDUAL_REFLECTION。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 48,
      "estimatedMinutes": 15,
      "administrationModes": [
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "此刻（“对你而言现在有多重要”）",
      "requiredTraining": true,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原48题顺序与1–6重要度选项。",
        "原表单第38题括号未闭合（…blood, violence），按原文逐字保留。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版用于自杀风险研究中保护因素的量化；与危险因素指标配合使用。"
        }
      ],
      "forbiddenUses": [
        "DIAGNOSIS",
        "HIGH_STAKES_SELECTION",
        "SCHOOL_RANKING",
        "TEACHER_ACCOUNTABILITY",
        "UNSUPPORTED_GROUP_COMPARISON",
        "INDIVIDUAL_REFLECTION"
      ]
    },
    "evidence": [
      {
        "evidenceId": "linehan-rfl-1983",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US adult psychiatric inpatients and community adults",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development with six-factor structure and discrimination between suicidal and nonsuicidal groups.",
        "rating": "SUFFICIENT",
        "citation": "Linehan MM, Goodstein JL, Nielsen SL, Chiles JA. (1983). Reasons for staying alive when you are thinking of killing yourself: The Reasons for Living Inventory. Journal of Consulting and Clinical Psychology, 51(2), 276–283.",
        "doi": "10.1037/0022-006X.51.2.276",
        "url": "https://doi.org/10.1037/0022-006X.51.2.276",
        "notes": "六因子题项归属未能自权威公开来源核实，本版本仅实现总分与均值；无临床界值，不用于风险分级。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "rfl48-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "rfl48-en-v1",
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
  "instruction": {
    "schemaVersion": 1,
    "text": "Many people have thought of suicide at least once. Others have never considered it. Whether you have considered it or not, we are interested in the reasons you would have for not committing suicide if the thought were to occur to you or if someone were to suggest it to you. On the following pages are reasons people sometimes give for not committing suicide. We would like to know how important each of these possible reasons would be to you at this time in your life as a reason to not kill yourself. Each reason can be rated from 1 (Not At All Important) to 6 (Extremely Important). If a reason does not apply to you or if you do not believe the statement is true, then it is not likely important and you should put a 1. Please use the whole range of choices so as not to rate only at the middle (2, 3, 4, 5) or only at the extremes (1, 6). Even if you never have or firmly believe you never would seriously consider killing yourself, it is still important that you rate each reason. In this case, rate on the basis of why killing yourself is not or would never be an alternative for you.",
    "language": "en",
    "version": "1.0.0",
    "source": "UW BRTC 分发题本 INSTRUCTIONS 段逐字转录（©1996 M. M. Linehan）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Reasons for Living Scale (RFL-48)",
        "citation": "Linehan MM, Goodstein JL, Nielsen SL, Chiles JA. (1983). Reasons for staying alive when you are thinking of killing yourself: The Reasons for Living Inventory. Journal of Consulting and Clinical Psychology, 51(2), 276–283.",
        "url": "https://depts.washington.edu/uwbrtc/wp-content/uploads/Reasons-for-Living-Scale-short-form-48-items.pdf",
        "publicationYear": 1983
      },
      "license": {
        "status": "restricted",
        "redistribution": "restricted",
        "note": "题本页脚 © 1996 M. M. Linehan，经华盛顿大学 BRTC 评估工具页公开分发；BRTC 声明其工具仅限研究、临床及教育用途，不得商业使用。本登记仅用于非商业研究草稿；正式发布、翻译或商业部署前须联系权利方。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "rfl_importance_1_6",
          "options": [
            {
              "value": "1",
              "label": "Not At All Important",
              "score": 1
            },
            {
              "value": "2",
              "label": "Quite Unimportant",
              "score": 2
            },
            {
              "value": "3",
              "label": "Somewhat Unimportant",
              "score": 3
            },
            {
              "value": "4",
              "label": "Somewhat Important",
              "score": 4
            },
            {
              "value": "5",
              "label": "Quite Important",
              "score": 5
            },
            {
              "value": "6",
              "label": "Extremely Important",
              "score": 6
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "RFL-01",
          "content": "I have a responsibility and commitment to my family.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-02",
          "content": "I believe I can learn to adjust or cope with my problems.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-03",
          "content": "I believe I have control over my life and destiny",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-04",
          "content": "I have a desire to live.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-05",
          "content": "I believe only God has the right to end a life.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-06",
          "content": "I am afraid of death",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-07",
          "content": "My family might believe I did not love them",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-08",
          "content": "I do not believe that things get miserable or hopeless enough that I would rather be dead",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-09",
          "content": "My family depends upon me and needs me",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-10",
          "content": "I do not want to die",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-11",
          "content": "I want to watch my children as they grow",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-12",
          "content": "Life is all we have and is better than nothing",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-13",
          "content": "I have future plans I am looking forward to carrying out",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-14",
          "content": "No matter how badly I feel, I know that it will not last",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-15",
          "content": "I am afraid of the unknown",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-16",
          "content": "I love and enjoy my family too much and could not leave them",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-17",
          "content": "I want to experience all that life has to offer and there are many experiences I haven't had yet which I want to have",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-18",
          "content": "I am afraid that my method of killing myself would fail",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-19",
          "content": "I care enough about myself to live",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-20",
          "content": "Life is too beautiful and precious to end it",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-21",
          "content": "It would not be fair to leave the children for others to take care of",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-22",
          "content": "I believe I can find other solutions to my problems",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-23",
          "content": "I am afraid of going to hell",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-24",
          "content": "I have a love of life",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-25",
          "content": "I am too stable to kill myself",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-26",
          "content": "I am a coward and do not have the guts to do it",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-27",
          "content": "My religious beliefs forbid it",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-28",
          "content": "The effect on my children could be harmful",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-29",
          "content": "I am curious about what will happen in the future",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-30",
          "content": "It would hurt my family too much and I would not want them to suffer",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-31",
          "content": "I am concerned about what others would think of me",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-32",
          "content": "I believe everything has a way of working out for the best",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-33",
          "content": "I could not decide where, when, and how to do it",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-34",
          "content": "I consider it morally wrong",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-35",
          "content": "I still have many things left to do",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-36",
          "content": "I have the courage to face life",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-37",
          "content": "I am happy and content with my life",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-38",
          "content": "I am afraid of the actual \"act\" of killing myself (the pain, blood, violence",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-39",
          "content": "I believe killing myself would not really accomplish or solve anything",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-40",
          "content": "I have hope that things will improve and the future will be happier",
          "type": "single",
          "required": true,
          "sortOrder": 39,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-41",
          "content": "Other people would think I am weak and selfish.",
          "type": "single",
          "required": true,
          "sortOrder": 40,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-42",
          "content": "I have an inner drive to survive",
          "type": "single",
          "required": true,
          "sortOrder": 41,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-43",
          "content": "I would not want people to think I did not have control over my life",
          "type": "single",
          "required": true,
          "sortOrder": 42,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-44",
          "content": "I believe I can find a purpose in life, a reason to live",
          "type": "single",
          "required": true,
          "sortOrder": 43,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-45",
          "content": "I see no reason to hurry death along",
          "type": "single",
          "required": true,
          "sortOrder": 44,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-46",
          "content": "I am so inept that my method would not work",
          "type": "single",
          "required": true,
          "sortOrder": 45,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-47",
          "content": "I would not want my family to feel guilty afterwards",
          "type": "single",
          "required": true,
          "sortOrder": 46,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "RFL-48",
          "content": "I would not want my family to think I was selfish or a coward",
          "type": "single",
          "required": true,
          "sortOrder": 47,
          "responseSetKey": "rfl_importance_1_6",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "RFL-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-35",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-36",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-39",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-40",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-41",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-42",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-43",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-44",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-45",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-46",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-47",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "RFL-48",
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
            "key": "total",
            "type": "total",
            "label": "全部48题总和（生存理由强度）",
            "description": "48题作答直接求和（无反向题）；必须完整作答。范围48–288，分数越高代表“不自杀的理由”被评价为越重要。",
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
                  "itemCode": "RFL-01",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-02",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-03",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-04",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-05",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-06",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-07",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-08",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-09",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-10",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-11",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-12",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-13",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-14",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-15",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-16",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-17",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-18",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-19",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-20",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-21",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-22",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-23",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-24",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-25",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-26",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-27",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-28",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-29",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-30",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-31",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-32",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-33",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-34",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-35",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-36",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-37",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-38",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-39",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-40",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-41",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-42",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-43",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-44",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-45",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-46",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-47",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-48",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "mean",
            "type": "total",
            "label": "全部48题均值",
            "description": "48题作答求均值（无反向题）；必须完整作答。范围1–6，便于不同时点比较。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "RFL-01",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-02",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-03",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-04",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-05",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-06",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-07",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-08",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-09",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-10",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-11",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-12",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-13",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-14",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-15",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-16",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-17",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-18",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-19",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-20",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-21",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-22",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-23",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-24",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-25",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-26",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-27",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-28",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-29",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-30",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-31",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-32",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-33",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-34",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-35",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-36",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-37",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-38",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-39",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-40",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-41",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-42",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-43",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-44",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-45",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-46",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-47",
                  "weight": 1
                },
                {
                  "itemCode": "RFL-48",
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
          "total",
          "mean"
        ],
        "scoreOrder": [
          "total"
        ],
        "interpretations": [
          {
            "scoreKey": "total",
            "headline": "撑住你的理由",
            "source": {
              "type": "score_only"
            },
            "summary": "这份记录汇总了你此刻为“活下去”所列理由的重要程度——对家人的责任、对未来的期待、对自己的在意、信念与价值观。它是研究情境下的保护因素指标，不是生存意志的排名，也不定义你想不想活。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "这48条理由里，哪一条是你自己最真实的？哪一条是“别人期待你有”的？"
              },
              {
                "category": "strategy",
                "text": "把对你最重要的三条写在随身可见的地方；如果此刻的痛苦压过了所有理由，请立即联系危机干预/心理援助热线或你信任的人。"
              }
            ]
          },
          {
            "scoreKey": "mean",
            "headline": "平均重要度",
            "source": {
              "type": "score_only"
            },
            "summary": "均值把总分换算回1–6范围，便于与之前或之后的记录比较。它不用于与他人比较，也不划分风险等级。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "与上次记录相比，哪些理由变得更重要、哪些变淡了？"
              },
              {
                "category": "strategy",
                "text": "与你的研究或治疗团队分享这份记录；新增一条属于你自己的理由，并具体到一次可执行的小事。"
              }
            ]
          }
        ],
        "limitations": [
          "本工具是研究情境下的保护因素指标，不是风险分级工具，也不定义个人的生存意志。",
          "原版样本为成人精神科与社区样本；不构成儿童青少年常模。",
          "六因子分量表的题项归属未经核实，本版本只提供总分与均值。",
          "没有常模、百分位或临床界值。",
          "含自杀相关内容；施测与结果反馈须配套专业支持流程，不得用于普通学生筛查。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。"
        ],
        "disclaimer": "仅供研究情境使用；若此刻出现自杀念头，请立即联系危机干预/心理援助热线、治疗团队或可信任的人。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-keyed-min",
        "answers": [
          {
            "itemCode": "RFL-01",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-02",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-03",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-04",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-05",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-06",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-07",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-08",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-09",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-10",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-11",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-12",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-13",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-14",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-15",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-16",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-17",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-18",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-19",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-20",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-21",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-22",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-23",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-24",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-25",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-26",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-27",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-28",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-29",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-30",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-31",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-32",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-33",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-34",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-35",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-36",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-37",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-38",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-39",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-40",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-41",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-42",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-43",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-44",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-45",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-46",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-47",
            "responseValue": "1"
          },
          {
            "itemCode": "RFL-48",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 48,
            "mean": 1.0
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "RFL-01",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-02",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-03",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-04",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-05",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-06",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-07",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-08",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-09",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-10",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-11",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-12",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-13",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-14",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-15",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-16",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-17",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-18",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-19",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-20",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-21",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-22",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-23",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-24",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-25",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-26",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-27",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-28",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-29",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-30",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-31",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-32",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-33",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-34",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-35",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-36",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-37",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-38",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-39",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-40",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-41",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-42",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-43",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-44",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-45",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-46",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-47",
            "responseValue": "6"
          },
          {
            "itemCode": "RFL-48",
            "responseValue": "6"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 288,
            "mean": 6.0
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      },
      {
        "name": "sample-odd3-even4",
        "answers": [
          {
            "itemCode": "RFL-01",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-02",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-03",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-04",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-05",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-06",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-07",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-08",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-09",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-10",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-11",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-12",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-13",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-14",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-15",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-16",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-17",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-18",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-19",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-20",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-21",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-22",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-23",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-24",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-25",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-26",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-27",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-28",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-29",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-30",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-31",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-32",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-33",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-34",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-35",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-36",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-37",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-38",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-39",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-40",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-41",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-42",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-43",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-44",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-45",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-46",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-47",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-48",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 168,
            "mean": 3.5
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      },
      {
        "name": "missing-total",
        "answers": [
          {
            "itemCode": "RFL-01",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-02",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-03",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-05",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-06",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-07",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-08",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-09",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-10",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-11",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-12",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-13",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-14",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-15",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-16",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-17",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-18",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-19",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-20",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-21",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-22",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-23",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-24",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-25",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-26",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-27",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-28",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-29",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-30",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-31",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-32",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-33",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-34",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-35",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-36",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-37",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-38",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-39",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-40",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-41",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-42",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-43",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-44",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-45",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-46",
            "responseValue": "4"
          },
          {
            "itemCode": "RFL-47",
            "responseValue": "3"
          },
          {
            "itemCode": "RFL-48",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "total": null,
            "mean": null
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
