/** Teacher Pilot Batch 1: canonical UK-English HSE Management Standards Indicator Tool source. PILOT scientific maturity; package release is distinct from DB publication. */
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "hse_msit_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "HSE Management Standards Indicator Tool — English",
      "abbreviation": "HSE-MSIT",
      "instrumentFamily": "HSE Management Standards Indicator Tool"
    },
    "construct": {
      "primaryDomain": "WELL_BEING",
      "secondaryDomains": [
        "SCHOOL_CLIMATE"
      ],
      "constructDefinition": "Psychosocial working conditions associated with work-related stress, operationalized as demands, control, managerial support, peer support, relationships, role, and change.",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": [
        "psychosocial_work_environment",
        "job_demands",
        "job_resources",
        "demands",
        "control",
        "support",
        "relationships",
        "role",
        "change",
        "occupational_stress"
      ]
    },
    "population": {
      "minAge": 18,
      "maxAge": 100,
      "populationNotes": "Generic adult workplace instrument. It can be applied to school staff as an occupational psychosocial environment measure; this package does not claim teacher-specific norms.",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 35,
      "estimatedMinutes": 10,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "Last six months",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "Keep the official item wording, scoring direction and source order. Do not use the HSE logo or imply HSE endorsement. The tool should form part of a broader risk-assessment process rather than being treated as the sole evidence source."
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED"
        },
        {
          "use": "PROGRAM_EVALUATION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "Organisational use requires governance appropriate to the deployment and should not be converted into individual teacher accountability."
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "The instrument is designed primarily for organisational psychosocial risk assessment rather than individual diagnosis."
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
        "evidenceId": "hse-msit-edwards-2008",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Employees from 39 UK organisations",
        "locale": "en-GB",
        "territory": "GB",
        "sampleSize": 26382,
        "studyDesign": "Large-sample confirmatory factor analysis of the 35-item HSE Indicator Tool; first-order seven-factor and higher-order models evaluated.",
        "rating": "SUFFICIENT",
        "citation": "Edwards JA, Webster S, Van Laar D, Easton S. (2008). Psychometric analysis of the UK Health and Safety Executive's Management Standards work-related stress Indicator Tool. Work & Stress, 22(2).",
        "doi": "10.1080/02678370802166599",
        "url": "https://doi.org/10.1080/02678370802166599"
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en-GB",
    "targetLocale": "en-GB",
    "localizationVersion": "1.0.0",
    "translationSource": "Official HSE Management Standards Indicator Tool English questionnaire (Crown copyright).",
    "adaptationMethod": "ORIGINAL_SOURCE",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [],
    "reviewStatus": "PENDING",
    "notes": "Exact UK-English source retained. Human source/content review remains pending before publication."
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
    "allowedCommercialNatures": [
      "NON_COMMERCIAL",
      "COMMERCIAL"
    ],
    "notes": [
      "Contains public sector information published by the Health and Safety Executive and licensed under the Open Government Licence.",
      "HSE logo and branding are excluded; do not imply HSE endorsement. The questionnaire source is distinct from any separately licensed hosted survey service."
    ]
  },
  "executable": {
    "releaseStatus": "PUBLISHED",
    "contentLocale": "en-GB",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "HSE Management Standards Indicator Tool",
        "citation": "Health and Safety Executive. Management Standards Indicator Tool (35-item questionnaire).",
        "url": "https://www.hse.gov.uk/stress/assets/docs/indicatortool.pdf"
      },
      "license": {
        "status": "verified",
        "redistribution": "allowed",
        "note": "Crown copyright material reused under the Open Government Licence. HSE logo excluded; attribution required."
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "hse_frequency_1_5",
          "options": [
            {
              "value": "never",
              "label": "Never",
              "score": 1
            },
            {
              "value": "seldom",
              "label": "Seldom",
              "score": 2
            },
            {
              "value": "sometimes",
              "label": "Sometimes",
              "score": 3
            },
            {
              "value": "often",
              "label": "Often",
              "score": 4
            },
            {
              "value": "always",
              "label": "Always",
              "score": 5
            }
          ]
        },
        {
          "key": "hse_agreement_1_5",
          "options": [
            {
              "value": "strongly_disagree",
              "label": "Strongly disagree",
              "score": 1
            },
            {
              "value": "disagree",
              "label": "Disagree",
              "score": 2
            },
            {
              "value": "neutral",
              "label": "Neutral",
              "score": 3
            },
            {
              "value": "agree",
              "label": "Agree",
              "score": 4
            },
            {
              "value": "strongly_agree",
              "label": "Strongly agree",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "HSE-01",
          "content": "I am clear what is expected of me at work",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-02",
          "content": "I can decide when to take a break",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-03",
          "content": "Different groups at work demand things from me that are hard to combine",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-04",
          "content": "I know how to go about getting my job done",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-05",
          "content": "I am subject to personal harassment in the form of unkind words or behaviour",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-06",
          "content": "I have unachievable deadlines",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-07",
          "content": "If work gets difficult, my colleagues will help me",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-08",
          "content": "I am given supportive feedback on the work I do",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-09",
          "content": "I have to work very intensively",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-10",
          "content": "I have a say in my own work speed",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-11",
          "content": "I am clear what my duties and responsibilities are",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-12",
          "content": "I have to neglect some tasks because I have too much to do",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-13",
          "content": "I am clear about the goals and objectives for my department",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-14",
          "content": "There is friction or anger between colleagues",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-15",
          "content": "I have a choice in deciding how I do my work",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-16",
          "content": "I am unable to take sufficient breaks",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-17",
          "content": "I understand how my work fits into the overall aim of the organisation",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-18",
          "content": "I am pressured to work long hours",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-19",
          "content": "I have a choice in deciding what I do at work",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-20",
          "content": "I have to work very fast",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-21",
          "content": "I am subject to bullying at work",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-22",
          "content": "I have unrealistic time pressures",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-23",
          "content": "I can rely on my line manager to help me out with a work problem",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "hse_frequency_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-24",
          "content": "I get help and support I need from colleagues",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-25",
          "content": "I have some say over the way I work",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-26",
          "content": "I have sufficient opportunities to question managers about change at work",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-27",
          "content": "I receive the respect at work I deserve from my colleagues",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-28",
          "content": "Staff are always consulted about change at work",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-29",
          "content": "I can talk to my line manager about something that has upset or annoyed me about work",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-30",
          "content": "My working time can be flexible",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-31",
          "content": "My colleagues are willing to listen to my work-related problems",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-32",
          "content": "When changes are made at work, I am clear how they will work out in practice",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-33",
          "content": "I am supported through emotionally demanding work",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-34",
          "content": "Relationships at work are strained",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "HSE-35",
          "content": "My line manager encourages me at work",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "hse_agreement_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "HSE-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-03",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-05",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-06",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-09",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-12",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-14",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-16",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-18",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-20",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-21",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-22",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "HSE-34",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "HSE-35",
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
            "key": "demands",
            "type": "dimension",
            "label": "Demands",
            "description": "HSE Management Standards Indicator Tool Demands scale mean (1–5); higher values indicate a more favourable reported psychosocial work environment on this dimension.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "HSE-03",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-06",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-09",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-12",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-16",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-18",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-20",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-22",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "control",
            "type": "dimension",
            "label": "Control",
            "description": "HSE Management Standards Indicator Tool Control scale mean (1–5); higher values indicate a more favourable reported psychosocial work environment on this dimension.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "HSE-02",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-10",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-15",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-19",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-25",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-30",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "managerial_support",
            "type": "dimension",
            "label": "Managerial Support",
            "description": "HSE Management Standards Indicator Tool Managerial Support scale mean (1–5); higher values indicate a more favourable reported psychosocial work environment on this dimension.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "HSE-08",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-23",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-29",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-33",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-35",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "peer_support",
            "type": "dimension",
            "label": "Peer Support",
            "description": "HSE Management Standards Indicator Tool Peer Support scale mean (1–5); higher values indicate a more favourable reported psychosocial work environment on this dimension.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "HSE-07",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-24",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-27",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-31",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "relationships",
            "type": "dimension",
            "label": "Relationships",
            "description": "HSE Management Standards Indicator Tool Relationships scale mean (1–5); higher values indicate a more favourable reported psychosocial work environment on this dimension.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "HSE-05",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-14",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-21",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-34",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "role",
            "type": "dimension",
            "label": "Role",
            "description": "HSE Management Standards Indicator Tool Role scale mean (1–5); higher values indicate a more favourable reported psychosocial work environment on this dimension.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "HSE-01",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-04",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-11",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-13",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-17",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "change",
            "type": "dimension",
            "label": "Change",
            "description": "HSE Management Standards Indicator Tool Change scale mean (1–5); higher values indicate a more favourable reported psychosocial work environment on this dimension.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 2,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "HSE-26",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-28",
                  "weight": 1
                },
                {
                  "itemCode": "HSE-32",
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
          "demands",
          "control",
          "managerial_support",
          "peer_support",
          "relationships",
          "role",
          "change"
        ],
        "scoreOrder": [
          "demands",
          "control",
          "managerial_support",
          "peer_support",
          "relationships",
          "role",
          "change"
        ],
        "interpretations": [
          {
            "scoreKey": "demands",
            "headline": "Demands (descriptive mean)",
            "source": {
              "type": "score_only"
            },
            "summary": "Mean score from 1 to 5 for the Demands dimension after source-specified direction reversal where applicable. Higher values represent a more favourable reported psychosocial work environment; no individual diagnostic cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Review workload, work pace, deadlines, task accumulation, and break opportunities that may be shaping the demands score."
              },
              {
                "category": "environment",
                "text": "Use the result as a prompt for workload and staffing review, prioritisation, scheduling, or task-design discussion rather than as an individual resilience judgment."
              }
            ]
          },
          {
            "scoreKey": "control",
            "headline": "Control (descriptive mean)",
            "source": {
              "type": "score_only"
            },
            "summary": "Mean score from 1 to 5 for the Control dimension after source-specified direction reversal where applicable. Higher values represent a more favourable reported psychosocial work environment; no individual diagnostic cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Consider how much practical choice you have over work methods, pace, sequencing, timing, and day-to-day decisions."
              },
              {
                "category": "environment",
                "text": "Where control is constrained, identify realistic decisions or work processes in which greater autonomy or participation could be introduced."
              }
            ]
          },
          {
            "scoreKey": "managerial_support",
            "headline": "Managerial Support (descriptive mean)",
            "source": {
              "type": "score_only"
            },
            "summary": "Mean score from 1 to 5 for the Managerial Support dimension after source-specified direction reversal where applicable. Higher values represent a more favourable reported psychosocial work environment; no individual diagnostic cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Review the accessibility, usefulness, and timeliness of line-manager help, feedback, encouragement, and support during difficult work."
              },
              {
                "category": "support",
                "text": "Use the pattern to identify concrete support needs or safer escalation routes rather than treating a low score as a judgment about one person."
              }
            ]
          },
          {
            "scoreKey": "peer_support",
            "headline": "Peer Support (descriptive mean)",
            "source": {
              "type": "score_only"
            },
            "summary": "Mean score from 1 to 5 for the Peer Support dimension after source-specified direction reversal where applicable. Higher values represent a more favourable reported psychosocial work environment; no individual diagnostic cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Consider whether colleagues are available for practical help, listening, information sharing, and mutual support when work becomes difficult."
              },
              {
                "category": "environment",
                "text": "Possible responses include peer consultation routines, team debriefs, mentoring, or clearer mechanisms for asking for help."
              }
            ]
          },
          {
            "scoreKey": "relationships",
            "headline": "Relationships (descriptive mean)",
            "source": {
              "type": "score_only"
            },
            "summary": "Mean score from 1 to 5 for the Relationships dimension after source-specified direction reversal where applicable. Higher values represent a more favourable reported psychosocial work environment; no individual diagnostic cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Review whether conflict, strained relationships, harassment, or bullying concerns are contributing to the reported pattern."
              },
              {
                "category": "support",
                "text": "Serious interpersonal concerns should be handled through appropriate organisational safeguarding, HR, union, or supervisory channels rather than through the questionnaire alone."
              }
            ]
          },
          {
            "scoreKey": "role",
            "headline": "Role (descriptive mean)",
            "source": {
              "type": "score_only"
            },
            "summary": "Mean score from 1 to 5 for the Role dimension after source-specified direction reversal where applicable. Higher values represent a more favourable reported psychosocial work environment; no individual diagnostic cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Check whether duties, responsibilities, priorities, goals, and how your work contributes to the organisation are sufficiently clear."
              },
              {
                "category": "environment",
                "text": "Clarifying responsibilities, decision rights, priorities, and competing expectations may be more useful than asking individuals to compensate for persistent role ambiguity."
              }
            ]
          },
          {
            "scoreKey": "change",
            "headline": "Change (descriptive mean)",
            "source": {
              "type": "score_only"
            },
            "summary": "Mean score from 1 to 5 for the Change dimension after source-specified direction reversal where applicable. Higher values represent a more favourable reported psychosocial work environment; no individual diagnostic cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Consider whether organisational changes are communicated clearly, whether staff are consulted, and whether practical consequences are understood."
              },
              {
                "category": "environment",
                "text": "Use the result to improve consultation, advance communication, implementation planning, and opportunities to ask questions during change."
              }
            ]
          }
        ],
        "limitations": [
          "No overall total score is created; the official tool is interpreted by psychosocial work-factor dimensions.",
          "The public source reviewed here does not establish a missing-data rule for digital scoring, so this DRAFT package conservatively requires complete responses within each dimension rather than inventing imputation.",
          "No teacher-specific or mainland-Chinese norm is included. Organisational findings should be triangulated with consultation and other risk-assessment information."
        ],
        "disclaimer": "HSE-MSIT results describe reported psychosocial working conditions. They are not a diagnosis, a teacher-performance score, or a standalone basis for employment or school accountability decisions."
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-midpoint",
        "answers": [
          {
            "itemCode": "HSE-01",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-02",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-03",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-04",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-05",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-06",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-07",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-08",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-09",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-10",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-11",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-12",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-13",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-14",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-15",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-16",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-17",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-18",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-19",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-20",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-21",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-22",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-23",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-24",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-25",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-26",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-27",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-28",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-29",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-30",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-31",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-32",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-33",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-34",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-35",
            "responseValue": "neutral"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "demands": 3,
            "control": 3,
            "managerial_support": 3,
            "peer_support": 3,
            "relationships": 3,
            "role": 3,
            "change": 3
          },
          "totalScoreKeys": [
            "demands",
            "control",
            "managerial_support",
            "peer_support",
            "relationships",
            "role",
            "change"
          ]
        }
      },
      {
        "name": "all-most-favourable",
        "answers": [
          {
            "itemCode": "HSE-01",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-02",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-03",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-04",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-05",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-06",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-07",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-08",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-09",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-10",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-11",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-12",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-13",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-14",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-15",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-16",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-17",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-18",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-19",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-20",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-21",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-22",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-23",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-24",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-25",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-26",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-27",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-28",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-29",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-30",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-31",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-32",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-33",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-34",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-35",
            "responseValue": "strongly_agree"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "demands": 5,
            "control": 5,
            "managerial_support": 5,
            "peer_support": 5,
            "relationships": 5,
            "role": 5,
            "change": 5
          },
          "totalScoreKeys": [
            "demands",
            "control",
            "managerial_support",
            "peer_support",
            "relationships",
            "role",
            "change"
          ]
        }
      },
      {
        "name": "all-least-favourable",
        "answers": [
          {
            "itemCode": "HSE-01",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-02",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-03",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-04",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-05",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-06",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-07",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-08",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-09",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-10",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-11",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-12",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-13",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-14",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-15",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-16",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-17",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-18",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-19",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-20",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-21",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-22",
            "responseValue": "always"
          },
          {
            "itemCode": "HSE-23",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-24",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-25",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-26",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-27",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-28",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-29",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-30",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-31",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-32",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-33",
            "responseValue": "strongly_disagree"
          },
          {
            "itemCode": "HSE-34",
            "responseValue": "strongly_agree"
          },
          {
            "itemCode": "HSE-35",
            "responseValue": "strongly_disagree"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "demands": 1,
            "control": 1,
            "managerial_support": 1,
            "peer_support": 1,
            "relationships": 1,
            "role": 1,
            "change": 1
          },
          "totalScoreKeys": [
            "demands",
            "control",
            "managerial_support",
            "peer_support",
            "relationships",
            "role",
            "change"
          ]
        }
      },
      {
        "name": "reverse-demand-item",
        "answers": [
          {
            "itemCode": "HSE-01",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-02",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-03",
            "responseValue": "never"
          },
          {
            "itemCode": "HSE-04",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-05",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-06",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-07",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-08",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-09",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-10",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-11",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-12",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-13",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-14",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-15",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-16",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-17",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-18",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-19",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-20",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-21",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-22",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-23",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-24",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-25",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-26",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-27",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-28",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-29",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-30",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-31",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-32",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-33",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-34",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-35",
            "responseValue": "neutral"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "demands": 3.25,
            "control": 3,
            "managerial_support": 3,
            "peer_support": 3,
            "relationships": 3,
            "role": 3,
            "change": 3
          },
          "totalScoreKeys": [
            "demands",
            "control",
            "managerial_support",
            "peer_support",
            "relationships",
            "role",
            "change"
          ]
        }
      },
      {
        "name": "missing-demand-item",
        "answers": [
          {
            "itemCode": "HSE-01",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-02",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-04",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-05",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-06",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-07",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-08",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-09",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-10",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-11",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-12",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-13",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-14",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-15",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-16",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-17",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-18",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-19",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-20",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-21",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-22",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-23",
            "responseValue": "sometimes"
          },
          {
            "itemCode": "HSE-24",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-25",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-26",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-27",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-28",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-29",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-30",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-31",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-32",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-33",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-34",
            "responseValue": "neutral"
          },
          {
            "itemCode": "HSE-35",
            "responseValue": "neutral"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "demands": null,
            "control": 3,
            "managerial_support": 3,
            "peer_support": 3,
            "relationships": 3,
            "role": 3,
            "change": 3
          },
          "totalScoreKeys": [
            "demands",
            "control",
            "managerial_support",
            "peer_support",
            "relationships",
            "role",
            "change"
          ]
        }
      }
    ]
  }
} satisfies import('../../../onboarding/types').ScaleInstrumentSourceV1
