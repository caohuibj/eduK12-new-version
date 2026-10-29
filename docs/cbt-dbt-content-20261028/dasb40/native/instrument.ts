import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text transcribed from the Beck Institute DAS Full Documents (Weissman & Beck, 1978); license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "dasb40",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Dysfunctional Attitude Scale, Form B (40 items)",
      "abbreviation": "DAS-B",
      "instrumentFamily": "Dysfunctional Attitude Scale"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "自评成就、认可、控制与关系方面的失调性态度（功能失调信念）的强度；与DAS-A为平行表。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:cbt",
        "construct:cbt_das_dysfunctional_attitudes",
        "dysfunctional_attitudes",
        "core_beliefs",
        "adult_self_report",
        "self_report",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "license:license_unverified"
      ]
    },
    "population": {
      "populationNotes": "原版开发与多数验证基于成人（大学生与抑郁临床对照）样本；未建立儿童青少年常模。K12学生施测前须评估年龄适配性。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 40,
      "estimatedMinutes": 15,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般态度（“按你多数时候的想法作答”），无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原40题顺序与七点同意度选项（完全同意=7 … 完全不同意=1）。",
        "10个功能信念题按官方计分表反向计分（8−作答）。",
        "原表第34题作 “you weaknesses”、第39题作 “advise”，均按原文逐字保留。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版用于抑郁易感性研究与CBT疗效研究的常用指标；B表与A表平行。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "态度强度反馈不构成诊断或人格判定。"
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
        "evidenceId": "weissman-beck-das-1978",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US adults (college and depressed samples in original validation)",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Scale development and validation of the DAS; parallel forms A and B refined from the 100-item version.",
        "rating": "SUFFICIENT",
        "citation": "Weissman AN, Beck AT. (1978). Development and validation of the Dysfunctional Attitude Scale: A preliminary investigation. Paper presented at the meeting of the American Educational Research Association, Toronto.",
        "url": "https://beckinstitute.org/wp-content/uploads/2021/06/DAS-Full-Documents-1.pdf",
        "notes": "B表反向键取自同一官方计分表FORM B列（1/5/12/14/19/20/26/30/33/36），题文内容逐题核对为功能信念方向；#12与#30在A/B两表均列为功能题。无本地常模，无临床界值。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "dasb40-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "dasb40-en-v1",
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
    "text": "REMEMBER, ANSWER EACH STATEMENT ACCORDING TO THE WAY YOU THINK MOST OF THE TIME",
    "language": "en",
    "version": "1.0.0",
    "source": "Beck Institute DAS Full Documents 中 DAS-B 表单页指导语，逐字转录。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Dysfunctional Attitude Scale, Form B (DAS-B)",
        "citation": "Weissman AN, Beck AT. (1978). Development and validation of the Dysfunctional Attitude Scale: A preliminary investigation. Paper presented at the meeting of the American Educational Research Association, Toronto.",
        "url": "https://beckinstitute.org/wp-content/uploads/2021/06/DAS-Full-Documents-1.pdf",
        "publicationYear": 1978
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "题本与官方计分说明来自 Beck Institute 评估工具页公开下载（DAS-Full-Documents）；页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布前须与 Beck Institute 确认权利。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "dasb_agree_1_7",
          "options": [
            {
              "value": "7",
              "label": "Totally agree",
              "score": 7
            },
            {
              "value": "6",
              "label": "Agree very much",
              "score": 6
            },
            {
              "value": "5",
              "label": "Agree slightly",
              "score": 5
            },
            {
              "value": "4",
              "label": "Neutral",
              "score": 4
            },
            {
              "value": "3",
              "label": "Disagree slightly",
              "score": 3
            },
            {
              "value": "2",
              "label": "Disagree very much",
              "score": 2
            },
            {
              "value": "1",
              "label": "Totally disagree",
              "score": 1
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "DASB-01",
          "content": "You can be a happy person without going out of your way to please other people.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-02",
          "content": "I have to impress new acquaintances with my charm, intelligence or wit or they won’t like me.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-03",
          "content": "If I put other peoples’ needs before my own, they should help me when I want them to do something for me.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-04",
          "content": "It is shameful for a person to display his weaknesses.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-05",
          "content": "People will like me even if I am not successful.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-06",
          "content": "People who have the marks of success (good looks, fame, wealth) are bound to be happier than people who do not.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-07",
          "content": "I should try to impress other people if I want them to like me.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-08",
          "content": "If a person I love does not love me it means I am unloveable.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-09",
          "content": "I ought to be able to solve my problems quickly and without a great deal of effort.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-10",
          "content": "If a person is indifferent to me, it means he does not like me.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-11",
          "content": "I should be able to please everybody.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-12",
          "content": "Others can care for me even if they know all my weaknesses.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-13",
          "content": "If people whom I care about do not care for me, it is awful.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-14",
          "content": "Criticism need not upset the person who receives the criticism.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-15",
          "content": "My life is wasted unless I am a success.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-16",
          "content": "People should prepare for the worst or they will be disappointed.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-17",
          "content": "I must be a useful, productive, creative person or life has no purpose.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-18",
          "content": "A person should think less of himself if other people do not accept him.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-19",
          "content": "I do not need other people’s approval for me to be happy.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-20",
          "content": "I can enjoy myself even when others do not like me.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-21",
          "content": "My value as a person greatly depends on what others think of me.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-22",
          "content": "If I make a foolish statement, it means I am a foolish person.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-23",
          "content": "If a person has to be alone for a long period of time, it follows that he has to feel lonely.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-24",
          "content": "A person should be able to control what happens to him.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-25",
          "content": "If a person is not a success, then his life is meaningless.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-26",
          "content": "A person doesn’t need to be well liked in order to be happy.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-27",
          "content": "If someone performs a selfish act, this means he is a selfish person.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-28",
          "content": "I should always have complete control over my feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-29",
          "content": "I should be happy all the time.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-30",
          "content": "If people consider me unattractive it need not upset me.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-31",
          "content": "Whenever I take a chance or risk I am only looking for trouble.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-32",
          "content": "A person cannot change his emotional reactions even if he knows they are harmful to him.",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-33",
          "content": "I may be able to influence other people’s behavior, but I cannot control it.",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-34",
          "content": "People will reject you if they know you weaknesses.",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-35",
          "content": "People should be criticized for their mistakes.",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-36",
          "content": "One should look for a practical solution to problems rather than a perfect solution.",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-37",
          "content": "If I do well, it probably is due to chance; if I do badly, it is probably my own fault.",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-38",
          "content": "The way to get people to like you is to impress them with your personality.",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-39",
          "content": "Turning to someone else for advise or help is an admission of weakness.",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASB-40",
          "content": "A person should do well at everything he undertakes.",
          "type": "single",
          "required": true,
          "sortOrder": 39,
          "responseSetKey": "dasb_agree_1_7",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "DASB-01",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-05",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-12",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-14",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-19",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-20",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-26",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-30",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-33",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-35",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-36",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASB-37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-39",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASB-40",
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
            "label": "全部40题总和（失调信念强度）",
            "description": "30个失调信念题按“完全同意=7”直接计分，10个功能信念题（1/5/12/14/19/20/26/30/33/36）按 8−作答 反向计分，全部求和；必须完整作答。范围40–280，分数越高代表失调态度越强。",
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
                  "itemCode": "DASB-01",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-02",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-03",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-04",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-05",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-06",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-07",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-08",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-09",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-10",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-11",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-12",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-13",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-14",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-15",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-16",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-17",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-18",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-19",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-20",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-21",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-22",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-23",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-24",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-25",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-26",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-27",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-28",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-29",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-30",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-31",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-32",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-33",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-34",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-35",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-36",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-37",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-38",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-39",
                  "weight": 1
                },
                {
                  "itemCode": "DASB-40",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          }
        ]
      },
      "report": {
        "reportVersion": "1.0.0",
        "primaryScoreKeys": [
          "total"
        ],
        "scoreOrder": [
          "total"
        ],
        "interpretations": [
          {
            "scoreKey": "total",
            "headline": "态度清单，不是成绩单",
            "source": {
              "type": "score_only"
            },
            "summary": "这份记录汇总了你对自己的成就、认可、控制与关系所持态度的“严格程度”。态度是长期形成的假设，不是事实清单，也不是缺陷证明；它们可以被看见、被检验、被更新。B表与A表是平行版本，分数不能互相换算。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "40条态度里，哪一条在你最近压力大的时候最常“自动发言”？"
              },
              {
                "category": "strategy",
                "text": "挑一条最刺眼的，写下“这条态度从哪里学来的”和“它帮过我什么、又限制了我什么”。"
              }
            ]
          }
        ],
        "limitations": [
          "总分反映失调态度的“强度汇总”，不是诊断指标，也不预测抑郁发生。",
          "B表与A表为平行版本，分数不能互换、相加或比较。",
          "原验证样本为成人；不构成儿童青少年常模。",
          "没有常模、百分位或临床界值；分数不能用于疗效判定。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。",
          "题本转录自 Beck Institute 公开下载资料，权利状态未确认。"
        ],
        "disclaimer": "仅供认识与反思，不用于诊断、高风险决策或替代专业帮助。"
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
            "itemCode": "DASB-01",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-02",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-03",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-04",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-05",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-06",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-07",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-08",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-10",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-11",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-12",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-13",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-14",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-15",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-16",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-17",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-18",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-19",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-20",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-21",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-22",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-23",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-24",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-25",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-26",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-27",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-28",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-29",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-30",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-31",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-32",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-33",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-34",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-35",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-36",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-37",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-38",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-39",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-40",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 40
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
            "itemCode": "DASB-01",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-02",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-03",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-04",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-05",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-06",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-07",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-08",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-09",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-10",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-11",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-12",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-13",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-15",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-16",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-17",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-18",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-19",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-20",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-21",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-22",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-23",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-24",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-25",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-26",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-27",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-28",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-29",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-30",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-31",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-32",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-33",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-34",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-35",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-36",
            "responseValue": "1"
          },
          {
            "itemCode": "DASB-37",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-38",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-39",
            "responseValue": "7"
          },
          {
            "itemCode": "DASB-40",
            "responseValue": "7"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 280
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      },
      {
        "name": "sample-rev3-rest5",
        "answers": [
          {
            "itemCode": "DASB-01",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-02",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-03",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-04",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-05",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-06",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-07",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-08",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-09",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-10",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-11",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-12",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-13",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-14",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-15",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-16",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-17",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-18",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-19",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-20",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-21",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-22",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-23",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-24",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-25",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-26",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-27",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-28",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-29",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-30",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-31",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-32",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-33",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-34",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-35",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-36",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-37",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-38",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-39",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-40",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "total": 200
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
            "itemCode": "DASB-02",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-03",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-04",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-05",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-06",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-07",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-08",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-09",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-10",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-11",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-12",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-13",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-14",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-15",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-16",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-17",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-18",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-19",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-20",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-21",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-22",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-23",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-24",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-25",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-26",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-27",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-28",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-29",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-30",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-31",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-32",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-33",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-34",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-35",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-36",
            "responseValue": "3"
          },
          {
            "itemCode": "DASB-37",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-38",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-39",
            "responseValue": "5"
          },
          {
            "itemCode": "DASB-40",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "total": null
          },
          "totalScoreKeys": [
            "total"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
