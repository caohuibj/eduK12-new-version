import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

/** CTAS-2 author's original English form. Research/professional reproduction permission; deployment remains gated. */
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "ctas2_cognitive_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Cognitive Test Anxiety Scale — Second Edition (English)",
      "abbreviation": "CTAS-2",
      "instrumentFamily": "Cognitive Test Anxiety Scale (Cassady)"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [
        "MOTIVATION"
      ],
      "constructDefinition": "考试准备与考试进行阶段的认知性焦虑、自我怀疑、失败预期及干扰性思维；不是儿童CTAS的第二版。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "cognitive_test_anxiety",
        "exam_worry",
        "self_report",
        "university_population_validated"
      ]
    },
    "population": {
      "minAge": 18,
      "populationNotes": "原作者提供英文24题；Severity Standards在大学生中验证，未发现中国K12青少年相同版本的本土证据。本候选限成人及大学生研究场景；不得自动用于小学/中学生施测。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 24,
      "estimatedMinutes": 7,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "General experiences across test preparation and test taking; no fixed recall window in author's form",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保持作者原英文24题顺序、四点英文选项和1–4编码；研究使用必须按作者主页要求署名。",
        "该量表与Wren/Benson儿童CTAS系列不同，不得混合计分或共享参考阈值。",
        "作者官网允许科研及专业在线共享；商业性公开部署和中国K12人群使用需进一步确认。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "限已有证据的人群与作者明确授权的研究/专业范围。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "只做原始分与认知考试焦虑构念描述，不采用大学生cutoffs评估中国K12学生。"
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
        "evidenceId": "ctas2-cassady-author-form",
        "evidenceType": "CONTENT_VALIDITY",
        "population": "原作者英文研究工具；已公开面向研究人员与专业使用",
        "locale": "en",
        "territory": "US",
        "studyDesign": "作者提供CTAS-2 24题题本、统一响应选项与总分求和说明；本条是原文来源证据，不构成独立内容效度研究",
        "rating": "UNKNOWN",
        "citation": "Cassady, J. C. Cognitive Test Anxiety Scale – 2nd Edition. Academic Anxiety Resource Center, Ball State University.",
        "url": "https://sites.bsu.edu/aarc/research/cognitive-test-anxiety-scale-2nd-edition/",
        "notes": "作者明确许可科研及专业在线复制分享，须恰当引用；本记录不替代部署场景的InstrumentAuthorization。"
      },
      {
        "evidenceId": "ctas2-thomas-cassady-finch-2018",
        "evidenceType": "CRITERION",
        "population": "美国大学生验证样本",
        "locale": "en",
        "territory": "US",
        "studyDesign": "潜在类别与聚类分析推导严重程度区间",
        "rating": "SUFFICIENT",
        "citation": "Thomas, C. L., Cassady, J. C., & Finch, W. H. (2018). Identifying Severity Standards on the Cognitive Test Anxiety Scale. Journal of Psychoeducational Assessment, 36(5).",
        "doi": "10.1177/0734282916686004",
        "url": "https://doi.org/10.1177/0734282916686004",
        "notes": "24–43/44–66/67+为大学生的研究切点；不转移至K12，当前运行版本referencePolicy=none。"
      },
      {
        "evidenceId": "ctas2-university-reliability-2024",
        "evidenceType": "INTERNAL_CONSISTENCY",
        "population": "大学生/高等教育学习者研究",
        "locale": "en",
        "territory": "US",
        "studyDesign": "研究文献报告CTAS-2较高内部一致性",
        "rating": "SUFFICIENT",
        "citation": "The Collective Influence of Intolerance of Uncertainty, Cognitive Test Anxiety, and Academic Self-Handicapping on Learner Outcomes: Evidence for a Process Model. (2024).",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10886387/",
        "notes": "文献综述报告Cronbach α≈0.96及McDonald's ω≈0.96；非中国K12常模。"
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en",
    "targetLocale": "en",
    "localizationVersion": "1.0.0",
    "translationSource": "Exact 24-item English author-hosted PDF: https://espace.bsu.edu/aarc/wp-content/uploads/sites/142/2016/09/Cognitive-Test-Anxiety-Scale-2nd-Edition-3.pdf",
    "adaptationMethod": "ORIGINAL_SOURCE",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [
      "ctas2-cassady-author-form",
      "ctas2-thomas-cassady-finch-2018",
      "ctas2-university-reliability-2024"
    ],
    "reviewStatus": "PENDING",
    "notes": "本版本不提供中文译文；作者PDF的4个选项原文保持不变；版式/原条目需在安装前再次核对。"
  },
  "instruction": {
    "schemaVersion": 1,
    "text": "Please complete the following items using the four-point scale below. Select the response that best describes you for each statement.",
    "language": "en",
    "version": "1.0.0",
    "source": "Author-hosted CTAS-2 form; introductory second sentence is a neutral digital administration clarification, pending display validation."
  },
  "usageRequirements": {
    "schemaVersion": 1,
    "policyVersion": "ctas2-research-draft-v1",
    "requiredRightsActions": [
      "electronicAdministration",
      "scoring",
      "display"
    ],
    "allowedCommercialNatures": [
      "NON_COMMERCIAL"
    ],
    "notes": [
      "Author grants reproduction, online presentation and professional sharing for research with attribution: https://sites.bsu.edu/aarc/research/cognitive-test-anxiety-scale-2nd-edition/",
      "Potential commercial use, territory/school reach and production authorization are not established by this GitHub source; InstrumentAuthorization governs actual usage."
    ]
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "ctas2-research-draft-v1",
    "respondentTypes": [
      "SELF"
    ],
    "subject": {
      "ageMonths": {
        "minInclusive": 216
      }
    },
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "ctas2-research-draft-v1",
    "audiences": {
      "respondent": {
        "numericScores": false,
        "references": false,
        "individualInterpretations": false,
        "scoreDerivedLabels": false,
        "resultQualityDetails": false,
        "rawAnswers": false,
        "itemScores": false,
        "methods": false,
        "educationalContent": false
      },
      "subject": {
        "numericScores": false,
        "references": false,
        "individualInterpretations": false,
        "scoreDerivedLabels": false,
        "resultQualityDetails": false,
        "rawAnswers": false,
        "itemScores": false,
        "methods": false,
        "educationalContent": false
      },
      "teacher": {
        "numericScores": false,
        "references": false,
        "individualInterpretations": false,
        "scoreDerivedLabels": false,
        "resultQualityDetails": false,
        "rawAnswers": false,
        "itemScores": false,
        "methods": false,
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
        "title": "Cognitive Test Anxiety Scale – 2nd Edition",
        "citation": "Cassady, J. C. Cognitive Test Anxiety Scale – 2nd Edition; Thomas, C. L., Cassady, J. C., & Finch, W. H. (2018). Journal of Psychoeducational Assessment.",
        "url": "https://sites.bsu.edu/aarc/research/cognitive-test-anxiety-scale-2nd-edition/"
      },
      "license": {
        "status": "verified",
        "redistribution": "allowed",
        "note": "Source author grants reproducibility/online professional sharing for research with appropriate citation. Commercial/open product use remains subject to separately verified rights scope."
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "ctas2_1_4_original",
          "options": [
            {
              "value": "1",
              "label": "Not at all typical of me",
              "score": 1
            },
            {
              "value": "2",
              "label": "Somewhat typical of me",
              "score": 2
            },
            {
              "value": "3",
              "label": "Quite typical of me",
              "score": 3
            },
            {
              "value": "4",
              "label": "Very typical of me",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "CTAS2-01",
          "content": "I lose sleep over worrying about examinations.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-02",
          "content": "I worry more about doing well on tests than I should.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-03",
          "content": "I get distracted from studying for tests by thoughts of failing.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-04",
          "content": "I have difficulty remembering what I studied for tests.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-05",
          "content": "While preparing for a test, I often think that I am likely to fail.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-06",
          "content": "I am not good at taking tests.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-07",
          "content": "When I first get my copy of a test, it takes me a while to calm down to the point where I can begin to think straight.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-08",
          "content": "At the beginning of a test, I am so nervous that I often can't think straight.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-09",
          "content": "When I take a test that is difficult, I feel defeated before I even start.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-10",
          "content": "While taking an important examination, I find myself wondering whether the other students are doing better than I am.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-11",
          "content": "I tend to freeze up on things like intelligence tests and final exams.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-12",
          "content": "During tests, I find myself thinking of the consequences of failing.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-13",
          "content": "When I take a test, my nervousness causes me to make careless errors.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-14",
          "content": "My mind goes blank when I am pressured for an answer on a test.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-15",
          "content": "During tests, the thought frequently occurs to me that I may not be too bright.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-16",
          "content": "During a course examination, I get so nervous that I forget facts I really know.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-17",
          "content": "I do not perform well on tests.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-18",
          "content": "During tests, I have the feeling that I am not doing well.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-19",
          "content": "I am a poor test taker in the sense that my performance on a test does not show how much I really know about a topic.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-20",
          "content": "After taking a test, I feel I should have done better than I actually did.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-21",
          "content": "My test performances make me believe that I am not a good student.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-22",
          "content": "I often realize mistakes I made right after turning in a test.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-23",
          "content": "When I finish a hard test, I am afraid to see the score.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        },
        {
          "itemCode": "CTAS2-24",
          "content": "I don’t seem to have much control over my test scores.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "ctas2_1_4_original",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "CTAS2-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CTAS2-24",
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
            "key": "cognitive_test_anxiety",
            "type": "total",
            "label": "Cognitive test anxiety (raw total)",
            "description": "Sum of all 24 original items, range 24–96; higher scores indicate more cognitive test anxiety, not clinical diagnosis.",
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
                  "itemCode": "CTAS2-01",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-02",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-03",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-04",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-05",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-06",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-07",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-08",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-09",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-10",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-11",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-12",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-13",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-14",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-15",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-16",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-17",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-18",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-19",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-20",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-21",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-22",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-23",
                  "weight": 1
                },
                {
                  "itemCode": "CTAS2-24",
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
          "cognitive_test_anxiety"
        ],
        "scoreOrder": [
          "cognitive_test_anxiety"
        ],
        "interpretations": [
          {
            "scoreKey": "cognitive_test_anxiety",
            "headline": "Cognitive experiences around tests",
            "source": {
              "type": "score_only"
            },
            "summary": "This result describes how often you endorsed thoughts and perceived interference related to examinations. The total raw score ranges from 24 to 96; a larger result reflects more endorsement of cognitive test-anxiety experiences. It is not a diagnosis or a percentile rank.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Consider which thoughts arise during test preparation and which arise after receiving the test."
              },
              {
                "category": "strategy",
                "text": "Try a brief study plan with specific practice tasks, manageable breaks and a pre-test routine."
              },
              {
                "category": "support",
                "text": "If worry significantly affects daily functioning or studying, consider talking with a qualified counselor or trusted support person."
              }
            ]
          }
        ],
        "limitations": [
          "This author-hosted CTAS-2 form was primarily studied in university populations; it is not validated as a Chinese K12 norm in this package.",
          "University low/moderate/high thresholds have deliberately not been loaded as K12 cutoffs; referencePolicy=none.",
          "The total reflects self-reported cognitive test anxiety, not objective ability, school performance, clinical symptoms or future outcomes.",
          "Incomplete responses are not assigned a numeric total in this initial executable draft; source did not establish a defensible proration rule."
        ],
        "disclaimer": "Research-oriented description only. This draft is not for diagnosis, school ranking, high-stakes selection or unsupervised deployment."
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
            "itemCode": "CTAS2-01",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-02",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-03",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-04",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-05",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-06",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-07",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-08",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-09",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-10",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-11",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-12",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-13",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-14",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-15",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-16",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-17",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-18",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-19",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-20",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-21",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-22",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-23",
            "responseValue": "1"
          },
          {
            "itemCode": "CTAS2-24",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "cognitive_test_anxiety": 24
          },
          "totalScoreKeys": [
            "cognitive_test_anxiety"
          ]
        }
      },
      {
        "name": "all-middle-2",
        "answers": [
          {
            "itemCode": "CTAS2-01",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-02",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-03",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-04",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-05",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-06",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-07",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-08",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-09",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-10",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-11",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-12",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-13",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-14",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-15",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-16",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-17",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-18",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-19",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-20",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-21",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-22",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-23",
            "responseValue": "2"
          },
          {
            "itemCode": "CTAS2-24",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "cognitive_test_anxiety": 48
          },
          "totalScoreKeys": [
            "cognitive_test_anxiety"
          ]
        }
      },
      {
        "name": "all-maximum",
        "answers": [
          {
            "itemCode": "CTAS2-01",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-02",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-03",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-04",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-05",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-06",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-07",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-08",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-09",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-10",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-11",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-12",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-13",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-14",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-15",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-16",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-17",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-18",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-19",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-20",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-21",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-22",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-23",
            "responseValue": "4"
          },
          {
            "itemCode": "CTAS2-24",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "cognitive_test_anxiety": 96
          },
          "totalScoreKeys": [
            "cognitive_test_anxiety"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
