/** Teacher Pilot Batch 1: canonical English CBI source. PILOT scientific maturity; package release is distinct from DB publication. */
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "cbi_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Copenhagen Burnout Inventory — English",
      "abbreviation": "CBI",
      "instrumentFamily": "Copenhagen Burnout Inventory"
    },
    "construct": {
      "primaryDomain": "WELL_BEING",
      "secondaryDomains": [],
      "constructDefinition": "Physical and psychological fatigue/exhaustion assessed as personal burnout, work-related burnout, and client-related burnout.",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "burnout",
        "exhaustion",
        "occupational_health",
        "work_related_burnout",
        "client_related_burnout"
      ]
    },
    "population": {
      "minAge": 18,
      "maxAge": 100,
      "populationNotes": "Generic adult occupational self-report instrument. Teacher validation supports use of the client-related domain as student-related burnout in a teacher adaptation, but this executable preserves the canonical English client wording.",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 19,
      "estimatedMinutes": 7,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "Current/recent work experience; canonical items use frequency or degree anchors",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "Preserve the canonical frequency/degree response sets. The PUMA source interspersed CBI items with other questionnaire content to reduce stereotyped responding; this standalone digital package does not claim to reproduce that broader PUMA layout."
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "Descriptive feedback requires human review; no diagnostic cutoff is asserted."
        },
        {
          "use": "PROGRESS_MONITORING",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "Repeated-measure interpretation is not automatically qualified by cross-sectional validity evidence."
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
        "evidenceId": "cbi-kristensen-2005",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Adult employees in the Danish PUMA study and related occupational samples",
        "locale": "en",
        "territory": "DK",
        "studyDesign": "Development and psychometric evaluation of personal, work-related, and client-related burnout scales.",
        "rating": "SUFFICIENT",
        "citation": "Kristensen TS, Borritz M, Villadsen E, Christensen KB. (2005). The Copenhagen Burnout Inventory: A new tool for the assessment of burnout. Work & Stress, 19(3), 192–207.",
        "doi": "10.1080/02678370500297720",
        "url": "https://doi.org/10.1080/02678370500297720"
      },
      {
        "evidenceId": "cbi-fiorilli-2015-teachers",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Italian teachers",
        "locale": "it",
        "territory": "IT",
        "sampleSize": 1497,
        "studyDesign": "Teacher-group validation using CFA, internal consistency and concurrent associations with work engagement and self-efficacy.",
        "rating": "SUFFICIENT",
        "citation": "Fiorilli C, De Stasio S, Benevene P, et al. (2015). Copenhagen Burnout Inventory (CBI): A validation study in an Italian teacher group.",
        "doi": "10.4473/TPM22.4.7",
        "url": "https://doi.org/10.4473/TPM22.4.7",
        "notes": "The teacher validation treated the client-related factor as student-related burnout."
      },
      {
        "evidenceId": "cbi-fong-2014-chinese",
        "evidenceType": "CROSS_CULTURAL_VALIDITY",
        "population": "Hong Kong human-service workers",
        "locale": "zh-HK",
        "territory": "HK",
        "sampleSize": 312,
        "studyDesign": "Chinese CBI psychometric evaluation with CFA, internal consistency, test-retest and concurrent validity; follow-up n=245.",
        "rating": "SUFFICIENT",
        "citation": "Fong TCT, Ho RTH, Ng SM. (2014). Psychometric Properties of the Copenhagen Burnout Inventory—Chinese Version. The Journal of Psychology, 148(3), 255–266.",
        "doi": "10.1080/00223980.2013.781498",
        "url": "https://doi.org/10.1080/00223980.2013.781498",
        "notes": "This record does not authorize or freeze any zh-CN/zh-HK item wording in the present English executable."
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en",
    "targetLocale": "en",
    "localizationVersion": "1.0.0",
    "translationSource": "Canonical English Copenhagen Burnout Inventory questionnaire from the Danish National Research Centre for the Working Environment (NFA).",
    "adaptationMethod": "ORIGINAL_SOURCE",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [],
    "reviewStatus": "PENDING",
    "notes": "No translation is present. Human source/content review remains pending before publication."
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "teacher-batch-1-v1",
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
    "policyVersion": "teacher-batch-1-v1",
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
  "usageRequirements": {
    "schemaVersion": 1,
    "policyVersion": "teacher-batch-1-v1",
    "requiredRightsActions": [
      "electronicAdministration",
      "scoring",
      "display"
    ],
    "notes": [
      "The original development program states a policy of free exchange of the questionnaire; teacher validation literature describes the CBI as a public-domain questionnaire.",
      "Before deployment, preserve source attribution and record the exact rights basis in InstrumentAuthorization."
    ]
  },
  "executable": {
    "releaseStatus": "PUBLISHED",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Copenhagen Burnout Inventory (CBI)",
        "citation": "Kristensen TS, Borritz M, Villadsen E, Christensen KB. (2005). The Copenhagen Burnout Inventory: A new tool for the assessment of burnout.",
        "url": "https://nfa.dk/vaerktoejer/spoergeskemaer/spoergeskema-til-maaling-af-udbraendthed-cbi/copenhagen-burnout-inventory-cbi",
        "publicationYear": 2005
      },
      "license": {
        "status": "verified",
        "redistribution": "allowed",
        "note": "CBI source materials are distributed freely by NFA; development/validation literature describes the questionnaire as public domain/free to exchange. Final deployment must retain provenance."
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "cbi_frequency",
          "options": [
            {
              "value": "always",
              "label": "Always",
              "score": 100
            },
            {
              "value": "often",
              "label": "Often",
              "score": 75
            },
            {
              "value": "sometimes",
              "label": "Sometimes",
              "score": 50
            },
            {
              "value": "seldom",
              "label": "Seldom",
              "score": 25
            },
            {
              "value": "never_almost_never",
              "label": "Never/almost never",
              "score": 0
            }
          ]
        },
        {
          "key": "cbi_degree",
          "options": [
            {
              "value": "very_high",
              "label": "To a very high degree",
              "score": 100
            },
            {
              "value": "high",
              "label": "To a high degree",
              "score": 75
            },
            {
              "value": "somewhat",
              "label": "Somewhat",
              "score": 50
            },
            {
              "value": "low",
              "label": "To a low degree",
              "score": 25
            },
            {
              "value": "very_low",
              "label": "To a very low degree",
              "score": 0
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "CBI-P1",
          "content": "How often do you feel tired?",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-P2",
          "content": "How often are you physically exhausted?",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-P3",
          "content": "How often are you emotionally exhausted?",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-P4",
          "content": "How often do you think: “I can’t take it anymore”?",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-P5",
          "content": "How often do you feel worn out?",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-P6",
          "content": "How often do you feel weak and susceptible to illness?",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-W1",
          "content": "Is your work emotionally exhausting?",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "cbi_degree",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-W2",
          "content": "Do you feel burnt out because of your work?",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "cbi_degree",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-W3",
          "content": "Does your work frustrate you?",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "cbi_degree",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-W4",
          "content": "Do you feel worn out at the end of the working day?",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-W5",
          "content": "Are you exhausted in the morning at the thought of another day at work?",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-W6",
          "content": "Do you feel that every working hour is tiring for you?",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-W7",
          "content": "Do you have enough energy for family and friends during leisure time?",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-C1",
          "content": "Do you find it hard to work with clients?",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "cbi_degree",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-C2",
          "content": "Do you find it frustrating to work with clients?",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "cbi_degree",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-C3",
          "content": "Does it drain your energy to work with clients?",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "cbi_degree",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-C4",
          "content": "Do you feel that you give more than you get back when you work with clients?",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "cbi_degree",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-C5",
          "content": "Are you tired of working with clients?",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        },
        {
          "itemCode": "CBI-C6",
          "content": "Do you sometimes wonder how long you will be able to continue working with clients?",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "cbi_frequency",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "CBI-P1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-P2",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-P3",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-P4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-P5",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-P6",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-W1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-W2",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-W3",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-W4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-W5",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-W6",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-W7",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CBI-C1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-C2",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-C3",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-C4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-C5",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CBI-C6",
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
            "key": "personal_burnout",
            "type": "dimension",
            "label": "Personal Burnout",
            "description": "Mean of six personal burnout items scored 0–100; calculable when at least three items are answered.",
            "direction": "higher_is_worse",
            "canonical": true,
            "displayPrecision": 1,
            "missingPolicy": {
              "type": "prorate_if_min_answered",
              "minimumAnswered": 3
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "CBI-P1",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-P2",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-P3",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-P4",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-P5",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-P6",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "work_related_burnout",
            "type": "dimension",
            "label": "Work-related Burnout",
            "description": "Mean of seven work-related burnout items scored 0–100; final energy item reverse-scored; calculable when at least four items are answered.",
            "direction": "higher_is_worse",
            "canonical": true,
            "displayPrecision": 1,
            "missingPolicy": {
              "type": "prorate_if_min_answered",
              "minimumAnswered": 4
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "CBI-W1",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-W2",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-W3",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-W4",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-W5",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-W6",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-W7",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "client_related_burnout",
            "type": "dimension",
            "label": "Client-related Burnout",
            "description": "Mean of six client-related burnout items scored 0–100; calculable when at least three items are answered.",
            "direction": "higher_is_worse",
            "canonical": true,
            "displayPrecision": 1,
            "missingPolicy": {
              "type": "prorate_if_min_answered",
              "minimumAnswered": 3
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "CBI-C1",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-C2",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-C3",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-C4",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-C5",
                  "weight": 1
                },
                {
                  "itemCode": "CBI-C6",
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
          "personal_burnout",
          "work_related_burnout",
          "client_related_burnout"
        ],
        "scoreOrder": [
          "personal_burnout",
          "work_related_burnout",
          "client_related_burnout"
        ],
        "interpretations": [
          {
            "scoreKey": "personal_burnout",
            "headline": "Personal burnout (descriptive)",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher values reflect greater self-reported physical and psychological fatigue/exhaustion. No diagnostic cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Review when fatigue and exhaustion are most noticeable, including patterns across workdays, recovery periods, sleep, and non-work demands."
              },
              {
                "category": "support",
                "text": "Persistent or worsening exhaustion that affects daily functioning warrants broader support and assessment; this score by itself is not a diagnosis."
              }
            ]
          },
          {
            "scoreKey": "work_related_burnout",
            "headline": "Work-related burnout (descriptive)",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher values reflect greater exhaustion attributed to work. The final energy-for-family/friends item is reverse-scored as specified by the source.",
            "bands": [],
            "guidance": [
              {
                "category": "environment",
                "text": "Examine workload, pace, deadlines, role demands, recovery time, staffing, and available resources that may be contributing to work-related exhaustion."
              },
              {
                "category": "strategy",
                "text": "Where feasible, identify one concrete work-design or recovery change to discuss with relevant school or workplace supports rather than placing responsibility solely on the individual."
              }
            ]
          },
          {
            "scoreKey": "client_related_burnout",
            "headline": "Client-related burnout (descriptive)",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher values reflect greater exhaustion attributed to work with clients. Teacher research may adapt the referent to students only as a separately governed localization/adaptation.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Consider whether emotionally demanding helping interactions are contributing disproportionately to exhaustion, while keeping the canonical client wording of this form in mind."
              },
              {
                "category": "support",
                "text": "Use this domain to inform supervision, peer consultation, boundary-setting, or service-support discussions; do not reinterpret it as a teacher-performance score."
              }
            ]
          }
        ],
        "limitations": [
          "The canonical English client wording is preserved; this package does not silently replace “clients” with “students”.",
          "No overall CBI total is created because the source defines three scales rather than a single canonical total.",
          "No diagnostic cutoff, severity label, norm or Chinese translation is asserted."
        ],
        "disclaimer": "CBI scores describe self-reported burnout/exhaustion dimensions and are not a medical diagnosis or an objective measure of employee performance."
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-maximum-burnout",
        "answers": [
          {
            "itemCode": "CBI-P1",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P2",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P3",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P4",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P5",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P6",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W1",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W2",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W3",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W4",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W5",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W6",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W7",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-C1",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C2",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C3",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C4",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C5",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-C6",
            "responseValue": "always"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "personal_burnout": 100,
            "work_related_burnout": 100,
            "client_related_burnout": 100
          },
          "totalScoreKeys": [
            "personal_burnout",
            "work_related_burnout",
            "client_related_burnout"
          ]
        }
      },
      {
        "name": "all-minimum-burnout",
        "answers": [
          {
            "itemCode": "CBI-P1",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-P2",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-P3",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-P4",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-P5",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-P6",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-W1",
            "responseValue": "very_low"
          },
          {
            "itemCode": "CBI-W2",
            "responseValue": "very_low"
          },
          {
            "itemCode": "CBI-W3",
            "responseValue": "very_low"
          },
          {
            "itemCode": "CBI-W4",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-W5",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-W6",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-W7",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-C1",
            "responseValue": "very_low"
          },
          {
            "itemCode": "CBI-C2",
            "responseValue": "very_low"
          },
          {
            "itemCode": "CBI-C3",
            "responseValue": "very_low"
          },
          {
            "itemCode": "CBI-C4",
            "responseValue": "very_low"
          },
          {
            "itemCode": "CBI-C5",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-C6",
            "responseValue": "never_almost_never"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "personal_burnout": 0,
            "work_related_burnout": 0,
            "client_related_burnout": 0
          },
          "totalScoreKeys": [
            "personal_burnout",
            "work_related_burnout",
            "client_related_burnout"
          ]
        }
      },
      {
        "name": "all-midpoint",
        "answers": [
          {
            "itemCode": "CBI-P1",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P2",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P3",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P4",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P5",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P6",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-W1",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-W2",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-W3",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-W4",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-W5",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-W6",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-W7",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-C1",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-C2",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-C3",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-C4",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-C5",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-C6",
            "responseValue": "sometimes"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "personal_burnout": 50,
            "work_related_burnout": 50,
            "client_related_burnout": 50
          },
          "totalScoreKeys": [
            "personal_burnout",
            "work_related_burnout",
            "client_related_burnout"
          ]
        }
      },
      {
        "name": "reverse-energy-item",
        "answers": [
          {
            "itemCode": "CBI-P1",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P2",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P3",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P4",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P5",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-P6",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-W1",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-W2",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-W3",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-W4",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-W5",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-W6",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-W7",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-C1",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-C2",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-C3",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-C4",
            "responseValue": "somewhat"
          },
          {
            "itemCode": "CBI-C5",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "CBI-C6",
            "responseValue": "sometimes"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "personal_burnout": 50,
            "work_related_burnout": 57.142857142857146,
            "client_related_burnout": 50
          },
          "totalScoreKeys": [
            "personal_burnout",
            "work_related_burnout",
            "client_related_burnout"
          ]
        }
      },
      {
        "name": "personal-one-missing-above-minimum",
        "answers": [
          {
            "itemCode": "CBI-P1",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P2",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P3",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P4",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P5",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W1",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W2",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W3",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W4",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W5",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W6",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W7",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-C1",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C2",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C3",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C4",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C5",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-C6",
            "responseValue": "always"
          }
        ],
        "expected": {
          "quality": "limited",
          "scores": {
            "personal_burnout": 100,
            "work_related_burnout": 100,
            "client_related_burnout": 100
          },
          "totalScoreKeys": [
            "personal_burnout",
            "work_related_burnout",
            "client_related_burnout"
          ]
        }
      },
      {
        "name": "personal-below-minimum",
        "answers": [
          {
            "itemCode": "CBI-W1",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W2",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W3",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-W4",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W5",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W6",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-W7",
            "responseValue": "never_almost_never"
          },
          {
            "itemCode": "CBI-C1",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C2",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C3",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C4",
            "responseValue": "very_high"
          },
          {
            "itemCode": "CBI-C5",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-C6",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P1",
            "responseValue": "always"
          },
          {
            "itemCode": "CBI-P2",
            "responseValue": "always"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "personal_burnout": null,
            "work_related_burnout": 100,
            "client_related_burnout": 100
          },
          "totalScoreKeys": [
            "personal_burnout",
            "work_related_burnout",
            "client_related_burnout"
          ]
        }
      }
    ]
  }
} satisfies import('../../../onboarding/types').ScaleInstrumentSourceV1
