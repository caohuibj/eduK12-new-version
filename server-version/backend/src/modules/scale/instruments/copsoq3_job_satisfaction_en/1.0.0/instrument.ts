/** Teacher Pilot Batch 1: COPSOQ III International Middle Job Satisfaction. PILOT scientific maturity; package release is distinct from DB publication. */
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "copsoq3_job_satisfaction_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "COPSOQ III Job Satisfaction — International Middle English",
      "abbreviation": "COPSOQ-III JS",
      "instrumentFamily": "Copenhagen Psychosocial Questionnaire III"
    },
    "construct": {
      "primaryDomain": "WELL_BEING",
      "secondaryDomains": [
        "ENGAGEMENT"
      ],
      "constructDefinition": "Global occupational job satisfaction assessed through work prospects, overall job appraisal, and salary in the COPSOQ III international middle version.",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "job_satisfaction",
        "occupational_wellbeing",
        "work_prospects",
        "overall_job_satisfaction",
        "salary_satisfaction"
      ]
    },
    "population": {
      "minAge": 18,
      "maxAge": 100,
      "populationNotes": "General working-adult self-report subscale from COPSOQ III. This package preserves the international English middle-version wording and does not claim Chinese-language equivalence.",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 3,
      "estimatedMinutes": 2,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "Current work in general",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "Preserve the COPSOQ III Job Satisfaction stem, the three International Middle items JS1/JS4/JS5, and the five satisfaction response categories."
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
          "notes": "Descriptive reflection only; no norm or threshold is included."
        },
        {
          "use": "PROGRESS_MONITORING",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "Useful as a brief repeated indicator only when interpreted without a clinical or minimal-change threshold."
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
        "evidenceId": "copsoq3-burr-2019",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Employees from Canada, Spain, France, Germany, Sweden and Turkey",
        "locale": "en",
        "territory": "GB",
        "sampleSize": 23361,
        "studyDesign": "International COPSOQ III middle-version reliability and psychometric evaluation across six countries.",
        "rating": "SUFFICIENT",
        "citation": "Burr H, Berthelsen H, Moncada S, et al. (2019). The Third Version of the Copenhagen Psychosocial Questionnaire. Safety and Health at Work, 10(4), 482–503.",
        "doi": "10.1016/j.shaw.2019.10.002",
        "url": "https://doi.org/10.1016/j.shaw.2019.10.002",
        "notes": "Supports the international middle version and its multidimensional occupational psychosocial measurement framework."
      },
      {
        "evidenceId": "copsoq3-china-huang-2025",
        "evidenceType": "CROSS_CULTURAL_VALIDITY",
        "population": "Workers in a Chinese medical consortium",
        "locale": "zh-CN",
        "territory": "CN",
        "sampleSize": 1054,
        "studyDesign": "Cross-sectional preliminary validation of the Chinese long version with item analysis, EFA/CFA, reliability and validity assessment.",
        "rating": "SUFFICIENT",
        "citation": "Huang Y, Zhang M, Wang F, et al. (2025). COPSOQ III in China: Preliminary Validation of an International Instrument to Measure Psychosocial Work Factors. Healthcare, 13(7), 825.",
        "doi": "10.3390/healthcare13070825",
        "url": "https://doi.org/10.3390/healthcare13070825",
        "notes": "Supports Chinese-context use of COPSOQ III generally, but does not freeze or authorize Chinese wording for this exact English three-item package."
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en",
    "targetLocale": "en",
    "localizationVersion": "1.0.0",
    "translationSource": "COPSOQ International Network official COPSOQ III international middle questionnaire.",
    "adaptationMethod": "ORIGINAL_SOURCE",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [],
    "reviewStatus": "PENDING",
    "notes": "English exact form only. Existing national-language versions must follow COPSOQ Network country/version coordination rules."
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "teacher-pilot-batch-v2",
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
    "policyVersion": "teacher-pilot-batch-v2",
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
    "policyVersion": "teacher-pilot-batch-v2",
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
      "COPSOQ III is free to use under the COPSOQ Network CC BY-NC-ND 4.0 licence and network guidelines.",
      "Commercial workplace use is allowed under the Network guidelines; no fee may be charged for use of the questionnaire per se, while assessment/advice/analysis/training services may be charged.",
      "Do not imply COPSOQ Network endorsement. Modified material must not be distributed as COPSOQ, and validated national versions require coordination with the relevant Network member."
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
        "title": "COPSOQ III — Job Satisfaction (International Middle)",
        "citation": "Burr H, Berthelsen H, Moncada S, et al. (2019). The Third Version of the Copenhagen Psychosocial Questionnaire.",
        "url": "https://www.copsoq-network.org/licence-guidelines-and-questionnaire",
        "publicationYear": 2019
      },
      "license": {
        "status": "verified",
        "redistribution": "allowed",
        "note": "Official COPSOQ Network questionnaire material: CC BY-NC-ND 4.0 with Network guidelines. This package preserves the unmodified International Middle Job Satisfaction items."
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "copsoq_satisfaction_0_100",
          "options": [
            {
              "value": "very_satisfied",
              "label": "Very satisfied",
              "score": 100
            },
            {
              "value": "satisfied",
              "label": "Satisfied",
              "score": 75
            },
            {
              "value": "neither_nor",
              "label": "Neither/Nor",
              "score": 50
            },
            {
              "value": "unsatisfied",
              "label": "Unsatisfied",
              "score": 25
            },
            {
              "value": "very_unsatisfied",
              "label": "Very unsatisfied",
              "score": 0
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "COPSOQ-JS1",
          "content": "your work prospects?",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "copsoq_satisfaction_0_100",
          "randomizeOptions": false
        },
        {
          "itemCode": "COPSOQ-JS4",
          "content": "your job as a whole, everything taken into consideration?",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "copsoq_satisfaction_0_100",
          "randomizeOptions": false
        },
        {
          "itemCode": "COPSOQ-JS5",
          "content": "your salary?",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "copsoq_satisfaction_0_100",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "COPSOQ-JS1",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "COPSOQ-JS4",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "COPSOQ-JS5",
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
            "key": "job_satisfaction",
            "type": "total",
            "label": "Job Satisfaction",
            "description": "Mean of COPSOQ III International Middle Job Satisfaction items JS1, JS4 and JS5 on the 0–100 COPSOQ scale.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 1,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "COPSOQ-JS1",
                  "weight": 1
                },
                {
                  "itemCode": "COPSOQ-JS4",
                  "weight": 1
                },
                {
                  "itemCode": "COPSOQ-JS5",
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
          "job_satisfaction"
        ],
        "scoreOrder": [
          "job_satisfaction"
        ],
        "interpretations": [
          {
            "scoreKey": "job_satisfaction",
            "headline": "Job satisfaction (descriptive)",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher scores indicate greater satisfaction across work prospects, the job as a whole, and salary in this brief COPSOQ III International Middle subscale. No norm or cutoff is applied.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Look at the three source items separately to see whether the overall mean is being driven mainly by prospects, overall job appraisal, or salary."
              },
              {
                "category": "environment",
                "text": "Interpret the score alongside concrete work conditions such as demands, control, support, role clarity, and change rather than assuming one cause for satisfaction or dissatisfaction."
              },
              {
                "category": "strategy",
                "text": "For repeated measurement, focus on transparent descriptive change over time; this package does not define a clinically or practically significant change threshold."
              }
            ]
          }
        ],
        "limitations": [
          "This is the three-item Job Satisfaction scale from the COPSOQ III International Middle version, not a complete facet inventory of job satisfaction.",
          "No population norms, severity bands, criterion thresholds, or minimal-important-change values are included.",
          "The score is a self-report appraisal and does not establish the cause of satisfaction or dissatisfaction.",
          "The English exact form must not be presented as a validated Chinese translation; Chinese long-version evidence is contextual evidence only.",
          "Do not use the score for teacher accountability, employment selection, or school ranking."
        ],
        "disclaimer": "This COPSOQ III Job Satisfaction score is a brief descriptive occupational self-report. It is not a diagnosis, a performance rating, or a causal assessment of workplace quality."
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-very-unsatisfied",
        "answers": [
          {
            "itemCode": "COPSOQ-JS1",
            "responseValue": "very_unsatisfied"
          },
          {
            "itemCode": "COPSOQ-JS4",
            "responseValue": "very_unsatisfied"
          },
          {
            "itemCode": "COPSOQ-JS5",
            "responseValue": "very_unsatisfied"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "job_satisfaction": 0
          },
          "totalScoreKeys": [
            "job_satisfaction"
          ]
        }
      },
      {
        "name": "all-neutral",
        "answers": [
          {
            "itemCode": "COPSOQ-JS1",
            "responseValue": "neither_nor"
          },
          {
            "itemCode": "COPSOQ-JS4",
            "responseValue": "neither_nor"
          },
          {
            "itemCode": "COPSOQ-JS5",
            "responseValue": "neither_nor"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "job_satisfaction": 50
          },
          "totalScoreKeys": [
            "job_satisfaction"
          ]
        }
      },
      {
        "name": "all-very-satisfied",
        "answers": [
          {
            "itemCode": "COPSOQ-JS1",
            "responseValue": "very_satisfied"
          },
          {
            "itemCode": "COPSOQ-JS4",
            "responseValue": "very_satisfied"
          },
          {
            "itemCode": "COPSOQ-JS5",
            "responseValue": "very_satisfied"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "job_satisfaction": 100
          },
          "totalScoreKeys": [
            "job_satisfaction"
          ]
        }
      },
      {
        "name": "mixed-mean",
        "answers": [
          {
            "itemCode": "COPSOQ-JS1",
            "responseValue": "very_satisfied"
          },
          {
            "itemCode": "COPSOQ-JS4",
            "responseValue": "neither_nor"
          },
          {
            "itemCode": "COPSOQ-JS5",
            "responseValue": "very_unsatisfied"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "job_satisfaction": 50
          },
          "totalScoreKeys": [
            "job_satisfaction"
          ]
        }
      },
      {
        "name": "missing-one",
        "answers": [
          {
            "itemCode": "COPSOQ-JS1",
            "responseValue": "satisfied"
          },
          {
            "itemCode": "COPSOQ-JS4",
            "responseValue": "satisfied"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "job_satisfaction": null
          },
          "totalScoreKeys": [
            "job_satisfaction"
          ]
        }
      }
    ]
  }
} satisfies import('../../../onboarding/types').ScaleInstrumentSourceV1
