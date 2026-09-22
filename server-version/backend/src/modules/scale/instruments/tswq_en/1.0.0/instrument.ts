/** Teacher Scale Batch 1: canonical English TSWQ source. Human scientific review/publication intentionally not asserted. */
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "tswq_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Teacher Subjective Wellbeing Questionnaire — English",
      "abbreviation": "TSWQ",
      "instrumentFamily": "Teacher Subjective Wellbeing Questionnaire"
    },
    "construct": {
      "primaryDomain": "WELL_BEING",
      "secondaryDomains": [
        "SELF_EFFICACY",
        "SCHOOL_CLIMATE"
      ],
      "constructDefinition": "Teacher-reported positive psychological functioning at work, represented by school connectedness and teaching efficacy.",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "teacher_wellbeing",
        "school_connectedness",
        "teaching_efficacy",
        "teacher_self_report"
      ]
    },
    "population": {
      "minAge": 18,
      "maxAge": 100,
      "populationNotes": "Developed specifically for teachers. This package is the canonical English self-report form; no claim of Chinese-language equivalence is made.",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 8,
      "estimatedMinutes": 3,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "Past month",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "Preserve the canonical eight item wordings and 1–4 response anchors; attribution to Tyler L. Renshaw and the CC BY 4.0 source is required."
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
          "notes": "May be used descriptively after human review of respondent-facing interpretation; no norms or cutoffs are asserted."
        },
        {
          "use": "PROGRESS_MONITORING",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "Repeated-measure interpretation requires longitudinal evidence in the intended population."
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
        "evidenceId": "tswq-renshaw-2015",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US elementary and middle school teachers",
        "locale": "en",
        "territory": "US",
        "sampleSize": 185,
        "studyDesign": "Initial instrument development; exploratory psychometric analyses, internal consistency, convergent/divergent validity, plus a smaller target teacher sample.",
        "rating": "SUFFICIENT",
        "citation": "Renshaw TL, Long ACJ, Cook CR. (2015). Assessing teachers' positive psychological functioning at work: Development and validation of the Teacher Subjective Wellbeing Questionnaire. School Psychology Quarterly, 30(2), 289–306.",
        "doi": "10.1037/spq0000112",
        "url": "https://doi.org/10.1037/spq0000112",
        "notes": "Original development supports a two-factor structure: school connectedness and teaching efficacy."
      },
      {
        "evidenceId": "tswq-mankin-2018",
        "evidenceType": "MEASUREMENT_INVARIANCE",
        "population": "US teachers across elementary, middle, and high school settings",
        "locale": "en",
        "territory": "US",
        "sampleSize": 1883,
        "studyDesign": "Confirmatory factor analysis and measurement invariance analyses across teacher/school groups.",
        "rating": "SUFFICIENT",
        "citation": "Mankin A, von der Embse N, Renshaw TL, Ryan SV. (2018). Assessing Teacher Wellness: Confirmatory Factor Analysis and Measurement Invariance of the Teacher Subjective Wellbeing Questionnaire. Journal of Psychoeducational Assessment, 36(3), 219–232.",
        "doi": "10.1177/0734282917707142",
        "url": "https://doi.org/10.1177/0734282917707142"
      },
      {
        "evidenceId": "tswq-xie-2024-cn",
        "evidenceType": "CROSS_CULTURAL_VALIDITY",
        "population": "Teachers from 56 middle schools across nine provinces in mainland China",
        "locale": "zh-CN",
        "territory": "CN",
        "sampleSize": 1463,
        "studyDesign": "Chinese revision validation with CFA, reliability, criterion associations, one-month retest subsample, and invariance across gender and teaching stages.",
        "rating": "SUFFICIENT",
        "citation": "Xie et al. (2024). Chinese revision of the Teacher Subjective Wellbeing Questionnaire. Chinese Journal of Clinical Psychology.",
        "doi": "10.16128/j.cnki.1005-3611.2024.04.030",
        "url": "https://doi.org/10.16128/j.cnki.1005-3611.2024.04.030",
        "notes": "Evidence supports a Chinese revision, but the exact Chinese item wording is not included in this English executable and must be separately source-verified before any zh-CN package is authored."
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en",
    "targetLocale": "en",
    "localizationVersion": "1.0.0",
    "translationSource": "Canonical English TSWQ user guide / original measure; no translation in this executable.",
    "adaptationMethod": "ORIGINAL_SOURCE",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [],
    "reviewStatus": "PENDING",
    "notes": "Human content review is still pending in Huisurvey; this PENDING status must not be interpreted as a validated localization."
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
      "CC BY 4.0 source materials: use, sharing and adaptation are permitted with attribution and indication of changes.",
      "No Chinese wording is included in this exact-form package."
    ]
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Teacher Subjective Wellbeing Questionnaire (TSWQ)",
        "citation": "Renshaw TL, Long ACJ, Cook CR. (2015). Assessing teachers' positive psychological functioning at work: Development and validation of the Teacher Subjective Wellbeing Questionnaire.",
        "url": "https://osf.io/6548v",
        "publicationYear": 2015
      },
      "license": {
        "status": "verified",
        "redistribution": "allowed",
        "note": "CC BY 4.0. Attribution required; no prior permission required for use/share/adaptation."
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "tswq_1_4",
          "options": [
            {
              "value": "1",
              "label": "Almost Never",
              "score": 1
            },
            {
              "value": "2",
              "label": "Sometimes",
              "score": 2
            },
            {
              "value": "3",
              "label": "Often",
              "score": 3
            },
            {
              "value": "4",
              "label": "Almost Always",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "TSWQ-01",
          "content": "I feel like I belong at this school.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "tswq_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSWQ-02",
          "content": "I am a successful teacher.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "tswq_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSWQ-03",
          "content": "I can really be myself at this school.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "tswq_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSWQ-04",
          "content": "I am good at helping students learn new things.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "tswq_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSWQ-05",
          "content": "I feel like people at this school care about me.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "tswq_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSWQ-06",
          "content": "I have accomplished a lot as a teacher.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "tswq_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSWQ-07",
          "content": "I am treated with respect at this school.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "tswq_1_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "TSWQ-08",
          "content": "I feel like my teaching is effective and helpful.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "tswq_1_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "TSWQ-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSWQ-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSWQ-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSWQ-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSWQ-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSWQ-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSWQ-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "TSWQ-08",
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
            "key": "school_connectedness",
            "type": "dimension",
            "label": "School Connectedness",
            "description": "Sum of TSWQ items 1, 3, 5, and 7.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "TSWQ-01",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-03",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-05",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-07",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "teaching_efficacy",
            "type": "dimension",
            "label": "Teaching Efficacy",
            "description": "Sum of TSWQ items 2, 4, 6, and 8.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "TSWQ-02",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-04",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-06",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-08",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "teacher_subjective_wellbeing",
            "type": "total",
            "label": "Teacher Subjective Wellbeing",
            "description": "Composite sum of all eight TSWQ items.",
            "direction": "higher_is_better",
            "canonical": true,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "TSWQ-01",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-02",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-03",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-04",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-05",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-06",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-07",
                  "weight": 1
                },
                {
                  "itemCode": "TSWQ-08",
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
          "school_connectedness",
          "teaching_efficacy",
          "teacher_subjective_wellbeing"
        ],
        "scoreOrder": [
          "school_connectedness",
          "teaching_efficacy",
          "teacher_subjective_wellbeing"
        ],
        "interpretations": [
          {
            "scoreKey": "school_connectedness",
            "headline": "School connectedness (descriptive)",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher scores indicate stronger self-reported belonging, authenticity, care and respect at school. No population norm or cutoff is applied.",
            "bands": [],
            "guidance": []
          },
          {
            "scoreKey": "teaching_efficacy",
            "headline": "Teaching efficacy (descriptive)",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher scores indicate stronger self-reported efficacy and accomplishment in teaching. This is a self-report construct, not an objective performance rating.",
            "bands": [],
            "guidance": []
          },
          {
            "scoreKey": "teacher_subjective_wellbeing",
            "headline": "Teacher subjective wellbeing composite (descriptive)",
            "source": {
              "type": "score_only"
            },
            "summary": "Composite of the two published TSWQ domains. Interpret alongside the two subscales rather than as a diagnostic or accountability score.",
            "bands": [],
            "guidance": []
          }
        ],
        "limitations": [
          "No population norms or diagnostic cutoffs are included.",
          "The English exact form must not be presented as a validated Chinese version.",
          "Do not use scores for teacher accountability, employment selection or school ranking."
        ],
        "disclaimer": "TSWQ scores are descriptive self-reports of positive psychological functioning at work and are not diagnostic or objective measures of teacher performance."
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "all-lowest",
        "answers": [
          {
            "itemCode": "TSWQ-01",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-02",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-03",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-04",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-05",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-06",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-07",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-08",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "school_connectedness": 4,
            "teaching_efficacy": 4,
            "teacher_subjective_wellbeing": 8
          },
          "totalScoreKeys": [
            "school_connectedness",
            "teaching_efficacy",
            "teacher_subjective_wellbeing"
          ]
        }
      },
      {
        "name": "all-highest",
        "answers": [
          {
            "itemCode": "TSWQ-01",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-02",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-03",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-04",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-05",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-06",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-07",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-08",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "school_connectedness": 16,
            "teaching_efficacy": 16,
            "teacher_subjective_wellbeing": 32
          },
          "totalScoreKeys": [
            "school_connectedness",
            "teaching_efficacy",
            "teacher_subjective_wellbeing"
          ]
        }
      },
      {
        "name": "all-mid-low",
        "answers": [
          {
            "itemCode": "TSWQ-01",
            "responseValue": "2"
          },
          {
            "itemCode": "TSWQ-02",
            "responseValue": "2"
          },
          {
            "itemCode": "TSWQ-03",
            "responseValue": "2"
          },
          {
            "itemCode": "TSWQ-04",
            "responseValue": "2"
          },
          {
            "itemCode": "TSWQ-05",
            "responseValue": "2"
          },
          {
            "itemCode": "TSWQ-06",
            "responseValue": "2"
          },
          {
            "itemCode": "TSWQ-07",
            "responseValue": "2"
          },
          {
            "itemCode": "TSWQ-08",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "school_connectedness": 8,
            "teaching_efficacy": 8,
            "teacher_subjective_wellbeing": 16
          },
          "totalScoreKeys": [
            "school_connectedness",
            "teaching_efficacy",
            "teacher_subjective_wellbeing"
          ]
        }
      },
      {
        "name": "subscale-separation",
        "answers": [
          {
            "itemCode": "TSWQ-01",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-02",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-03",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-04",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-05",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-06",
            "responseValue": "1"
          },
          {
            "itemCode": "TSWQ-07",
            "responseValue": "4"
          },
          {
            "itemCode": "TSWQ-08",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "school_connectedness": 16,
            "teaching_efficacy": 4,
            "teacher_subjective_wellbeing": 20
          },
          "totalScoreKeys": [
            "school_connectedness",
            "teaching_efficacy",
            "teacher_subjective_wellbeing"
          ]
        }
      },
      {
        "name": "missing-one",
        "answers": [
          {
            "itemCode": "TSWQ-01",
            "responseValue": "3"
          },
          {
            "itemCode": "TSWQ-02",
            "responseValue": "3"
          },
          {
            "itemCode": "TSWQ-03",
            "responseValue": "3"
          },
          {
            "itemCode": "TSWQ-04",
            "responseValue": "3"
          },
          {
            "itemCode": "TSWQ-05",
            "responseValue": "3"
          },
          {
            "itemCode": "TSWQ-06",
            "responseValue": "3"
          },
          {
            "itemCode": "TSWQ-07",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "school_connectedness": 12,
            "teaching_efficacy": null,
            "teacher_subjective_wellbeing": null
          },
          "totalScoreKeys": [
            "school_connectedness",
            "teaching_efficacy",
            "teacher_subjective_wellbeing"
          ]
        }
      }
    ]
  }
} satisfies import('../../../onboarding/types').ScaleInstrumentSourceV1
