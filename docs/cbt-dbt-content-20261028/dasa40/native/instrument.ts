import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text transcribed from the Beck Institute DAS Full Documents (Weissman & Beck, 1978); license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "dasa40",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Dysfunctional Attitude Scale, Form A (40 items)",
      "abbreviation": "DAS-A",
      "instrumentFamily": "Dysfunctional Attitude Scale"
    },
    "construct": {
      "primaryDomain": "SELF_REGULATION",
      "secondaryDomains": [],
      "constructDefinition": "自评成就、认可、控制与关系方面的失调性态度（功能失调信念）的强度。",
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
        "10个功能信念题按官方计分表反向计分（8−作答）。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版用于抑郁易感性研究与CBT疗效研究的常用指标。"
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
        "notes": "反向键以Beck Institute官方计分表为准，并与de Graaf et al. (2009) 对原计分键的引用一致；de Graaf指出反向题易形成方法因子，解读总分时须谨慎。无本地常模，无临床界值。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "dasa40-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "dasa40-en-v1",
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
    "source": "Beck Institute DAS Full Documents 中 DAS-A 表单页指导语，逐字转录。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Dysfunctional Attitude Scale, Form A (DAS-A)",
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
          "key": "dasa_agree_1_7",
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
          "itemCode": "DASA-01",
          "content": "It is difficult to be happy unless one is good looking, intelligent, rich and creative.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-02",
          "content": "Happiness is more a matter of my attitude towards myself than the way other people feel about me.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-03",
          "content": "People will probably think less of me if I make a mistake.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-04",
          "content": "If I do not do well all the time, people will not respect me.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-05",
          "content": "Taking even a small risk is foolish because the loss is likely to be a disaster.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-06",
          "content": "It is possible to gain another person’s respect without being especially talented at anything.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-07",
          "content": "I cannot be happy unless most people I know admire me.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-08",
          "content": "If a person asks for help, it is a sign of weakness.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-09",
          "content": "If I do not do as well as other people, it means I am an inferior human being.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-10",
          "content": "If I fail at my work, then I am a failure as a person.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-11",
          "content": "If you cannot do something well, there is little point in doing it at all.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-12",
          "content": "Making mistakes is fine because I can learn from them.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-13",
          "content": "If someone disagrees with me, it probably indicates that he does not like me.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-14",
          "content": "If I fail partly, it is as bad as being a complete failure.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-15",
          "content": "If other people know what you are really like, they will think less of you.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-16",
          "content": "I am nothing if a person I love does not love me.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-17",
          "content": "One can get pleasure from an activity regardless of the result.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-18",
          "content": "People should have a reasonable likelihood of success before undertaking anything.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-19",
          "content": "My value as a person depends greatly on what others think of me.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-20",
          "content": "If I don’t set the highest standards for myself, I am likely to end up a second-rate person.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-21",
          "content": "If I am to be a worthwhile person, I must be truly outstanding in at least one major respect.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-22",
          "content": "People who have good ideas are more worthy than those who do not.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-23",
          "content": "I should be upset if I make a mistake.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-24",
          "content": "My own opinions of myself are more important than others’ opinions of me.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-25",
          "content": "To be a good, moral, worthwhile person, I must help everyone who needs it.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-26",
          "content": "If I ask a question, it makes me look inferior.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-27",
          "content": "It is awful to be disapproved of by other people important to you.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-28",
          "content": "If you don’t have other people to lean on, you are bound to be sad.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-29",
          "content": "I can reach important goals without slave driving myself.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-30",
          "content": "It is possible for a person to be scolded and not get upset.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-31",
          "content": "I cannot trust other people because they might be cruel to me.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-32",
          "content": "If others dislike you, you cannot be happy.",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-33",
          "content": "It is best to give up your own interests in order to please other people.",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-34",
          "content": "My happiness depends more on other people than it does on me.",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-35",
          "content": "I do not need the approval of other people in order to be happy.",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-36",
          "content": "If a person avoids problems, the problems tend to go away.",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-37",
          "content": "I can be happy even if I miss out on many of the good things in life.",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-38",
          "content": "What other people think about me is very important.",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-39",
          "content": "Being isolated from other people is bound to lead to unhappiness.",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "DASA-40",
          "content": "I can find happiness without being loved by another person.",
          "type": "single",
          "required": true,
          "sortOrder": 39,
          "responseSetKey": "dasa_agree_1_7",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "DASA-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-02",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-06",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-12",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-17",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-24",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-29",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-30",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-35",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-36",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-37",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "DASA-38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-39",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "DASA-40",
            "transform": {
              "type": "reverse"
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
            "description": "30个失调信念题按“完全同意=7”直接计分，10个功能信念题（2/6/12/17/24/29/30/35/37/40）按 8−作答 反向计分，全部求和；必须完整作答。范围40–280，分数越高代表失调态度越强。",
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
                  "itemCode": "DASA-01",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-02",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-03",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-04",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-05",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-06",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-07",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-08",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-09",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-10",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-11",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-12",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-13",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-14",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-15",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-16",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-17",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-18",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-19",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-20",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-21",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-22",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-23",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-24",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-25",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-26",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-27",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-28",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-29",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-30",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-31",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-32",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-33",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-34",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-35",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-36",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-37",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-38",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-39",
                  "weight": 1
                },
                {
                  "itemCode": "DASA-40",
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
            "summary": "这份记录汇总了你对自己的成就、认可、控制与关系所持态度的“严格程度”。态度是长期形成的假设，不是事实清单，也不是缺陷证明；它们可以被看见、被检验、被更新。",
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
          "原验证样本为成人；不构成儿童青少年常模。",
          "反向题易形成方法因子（de Graaf et al., 2009），总分解读须谨慎。",
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
            "itemCode": "DASA-01",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-02",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-03",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-04",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-05",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-06",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-07",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-08",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-09",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-10",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-11",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-12",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-13",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-14",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-15",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-16",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-17",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-18",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-19",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-20",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-21",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-22",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-23",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-24",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-25",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-26",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-27",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-28",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-29",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-30",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-31",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-32",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-33",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-34",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-35",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-36",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-37",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-38",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-39",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-40",
            "responseValue": "7"
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
            "itemCode": "DASA-01",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-02",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-03",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-04",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-05",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-06",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-07",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-08",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-09",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-10",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-11",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-12",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-13",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-14",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-15",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-16",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-17",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-18",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-19",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-20",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-21",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-22",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-23",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-24",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-25",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-26",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-27",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-28",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-29",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-30",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-31",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-32",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-33",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-34",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-35",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-36",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-37",
            "responseValue": "1"
          },
          {
            "itemCode": "DASA-38",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-39",
            "responseValue": "7"
          },
          {
            "itemCode": "DASA-40",
            "responseValue": "1"
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
            "itemCode": "DASA-01",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-02",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-03",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-04",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-05",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-06",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-07",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-08",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-09",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-10",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-11",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-12",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-13",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-14",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-15",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-16",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-17",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-18",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-19",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-20",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-21",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-22",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-23",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-24",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-25",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-26",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-27",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-28",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-29",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-30",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-31",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-32",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-33",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-34",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-35",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-36",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-37",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-38",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-39",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-40",
            "responseValue": "3"
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
            "itemCode": "DASA-01",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-03",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-04",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-05",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-06",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-07",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-08",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-09",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-10",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-11",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-12",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-13",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-14",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-15",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-16",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-17",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-18",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-19",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-20",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-21",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-22",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-23",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-24",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-25",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-26",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-27",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-28",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-29",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-30",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-31",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-32",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-33",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-34",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-35",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-36",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-37",
            "responseValue": "3"
          },
          {
            "itemCode": "DASA-38",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-39",
            "responseValue": "5"
          },
          {
            "itemCode": "DASA-40",
            "responseValue": "3"
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
