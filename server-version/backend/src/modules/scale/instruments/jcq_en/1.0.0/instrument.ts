/** Teacher Pilot Batch 1: canonical English Job Crafting Questionnaire. PILOT scientific maturity; package release is distinct from DB publication. */
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "jcq_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Job Crafting Questionnaire — English",
      "abbreviation": "JCQ",
      "instrumentFamily": "Job Crafting Questionnaire"
    },
    "construct": {
      "primaryDomain": "ENGAGEMENT",
      "secondaryDomains": [
        "SELF_REGULATION"
      ],
      "constructDefinition": "Self-reported frequency of proactive task, cognitive, and relational changes employees make to shape their experience of work.",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "job_crafting",
        "proactive_work_behavior",
        "task_crafting",
        "cognitive_crafting",
        "relational_crafting",
        "teacher_work"
      ]
    },
    "population": {
      "minAge": 18,
      "maxAge": 100,
      "populationNotes": "Developed for general working adults; the original development sample included multiple occupational sectors. Teacher research supports contextual relevance, but this exact English 1–6 package is not presented as a validated Chinese teacher translation.",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL"
    },
    "administration": {
      "itemCount": 15,
      "estimatedMinutes": 5,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "Current work; frequency of job-crafting behaviours and cognitions",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "Preserve the canonical 15 English items and the 1 (Hardly Ever) to 6 (Very Often) frequency scale. 'Very Often' means as often as possible in the respondent's workplace."
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
          "notes": "Descriptive reflection only; higher frequency is not assumed to be universally better."
        },
        {
          "use": "PROGRESS_MONITORING",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "No minimal-important-change threshold or longitudinal cut-off is included."
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
        "evidenceId": "jcq-slemp-2013",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Working adults from multiple Australian organisations",
        "locale": "en",
        "territory": "AU",
        "sampleSize": 334,
        "studyDesign": "Scale development with exploratory and confirmatory factor analyses, internal consistency and convergent validity analyses.",
        "rating": "SUFFICIENT",
        "citation": "Slemp GR, Vella-Brodrick DA. (2013). The Job Crafting Questionnaire: A new scale to measure the extent to which employees engage in job crafting. International Journal of Wellbeing, 3(2), 126–146.",
        "doi": "10.5502/ijw.v3i2.1",
        "url": "https://doi.org/10.5502/ijw.v3i2.1",
        "notes": "Supports three correlated dimensions—task, cognitive and relational crafting—and the 15-item final form."
      },
      {
        "evidenceId": "jcq-teacher-context-zheng-2024",
        "evidenceType": "CRITERION",
        "population": "Chinese English-as-a-Foreign-Language teachers",
        "locale": "zh-CN",
        "territory": "CN",
        "sampleSize": 456,
        "studyDesign": "Cross-sectional teacher study relating job crafting to teacher-student relationships and psychological well-being.",
        "rating": "MIXED",
        "citation": "Zheng X, Huang H, Yu Q. (2024). The associations among gratitude, job crafting, teacher-student relationships, and teacher psychological well-being. Frontiers in Psychology, 15, 1329782.",
        "doi": "10.3389/fpsyg.2024.1329782",
        "url": "https://doi.org/10.3389/fpsyg.2024.1329782",
        "notes": "Supports teacher-context relevance. The study reports a 15-item job-crafting measure with a 1–5 response format; it is not treated as exact-form validation of this canonical 1–6 English JCQ package."
      }
    ],
    "referenceApplicability": []
  },
  "localization": {
    "schemaVersion": 1,
    "sourceLocale": "en",
    "targetLocale": "en",
    "localizationVersion": "1.0.0",
    "translationSource": "Canonical English JCQ appendix in Slemp & Vella-Brodrick (2013).",
    "adaptationMethod": "ORIGINAL_SOURCE",
    "expertReviewStatus": "PENDING",
    "cognitiveDebriefStatus": "NOT_ESTABLISHED",
    "localEvidenceRefs": [],
    "reviewStatus": "PENDING",
    "notes": "No Chinese wording is included. Any Chinese adaptation must be separately source-verified and governed."
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
      "NON_COMMERCIAL"
    ],
    "notes": [
      "The journal page states the JCQ may be used for research with proper credit without individual permission.",
      "Redistribution, commercial deployment, and adapted-form rights are not treated as unrestricted by this source record and require separate authorization review."
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
        "title": "Job Crafting Questionnaire (JCQ)",
        "citation": "Slemp GR, Vella-Brodrick DA. (2013). The Job Crafting Questionnaire: A new scale to measure the extent to which employees engage in job crafting.",
        "url": "https://internationaljournalofwellbeing.org/index.php/ijow/article/view/217",
        "publicationYear": 2013
      },
      "license": {
        "status": "verified",
        "redistribution": "restricted",
        "note": "Research use is explicitly granted with proper credit without individual permission. This package does not treat redistribution/commercial/adaptation rights as unrestricted."
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "jcq_1_6",
          "options": [
            {
              "value": "1",
              "label": "Hardly Ever",
              "score": 1
            },
            {
              "value": "2",
              "label": "2",
              "score": 2
            },
            {
              "value": "3",
              "label": "3",
              "score": 3
            },
            {
              "value": "4",
              "label": "4",
              "score": 4
            },
            {
              "value": "5",
              "label": "5",
              "score": 5
            },
            {
              "value": "6",
              "label": "Very Often",
              "score": 6
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "JCQ-01",
          "content": "Introduce new approaches to improve your work",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-02",
          "content": "Change the scope or types of tasks that you complete at work",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-03",
          "content": "Introduce new work tasks that you think better suit your skills or interests",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-04",
          "content": "Choose to take on additional tasks at work",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-05",
          "content": "Give preference to work tasks that suit your skills or interests",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-06",
          "content": "Think about how your job gives your life purpose",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-07",
          "content": "Remind yourself about the significance your work has for the success of the organisation",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-08",
          "content": "Remind yourself of the importance of your work for the broader community",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-09",
          "content": "Think about the ways in which your work positively impacts your life",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-10",
          "content": "Reflect on the role your job has for your overall well-being",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-11",
          "content": "Make an effort to get to know people well at work",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-12",
          "content": "Organise or attend work related social functions",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-13",
          "content": "Organise special events in the workplace (e.g., celebrating a co-worker's birthday)",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-14",
          "content": "Choose to mentor new employees (officially or unofficially)",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        },
        {
          "itemCode": "JCQ-15",
          "content": "Make friends with people at work who have similar skills or interests",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "jcq_1_6",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "JCQ-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "JCQ-15",
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
            "key": "task_crafting",
            "type": "dimension",
            "label": "Task Crafting",
            "description": "Mean frequency across JCQ items 1–5.",
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
                  "itemCode": "JCQ-01",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-02",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-03",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-04",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-05",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "cognitive_crafting",
            "type": "dimension",
            "label": "Cognitive Crafting",
            "description": "Mean frequency across JCQ items 6–10.",
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
                  "itemCode": "JCQ-06",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-07",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-08",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-09",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-10",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "relational_crafting",
            "type": "dimension",
            "label": "Relational Crafting",
            "description": "Mean frequency across JCQ items 11–15.",
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
                  "itemCode": "JCQ-11",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-12",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-13",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-14",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-15",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "total_job_crafting",
            "type": "total",
            "label": "Overall Job Crafting",
            "description": "Mean frequency across all 15 JCQ items.",
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
                  "itemCode": "JCQ-01",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-02",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-03",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-04",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-05",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-06",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-07",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-08",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-09",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-10",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-11",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-12",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-13",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-14",
                  "weight": 1
                },
                {
                  "itemCode": "JCQ-15",
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
          "task_crafting",
          "cognitive_crafting",
          "relational_crafting",
          "total_job_crafting"
        ],
        "scoreOrder": [
          "task_crafting",
          "cognitive_crafting",
          "relational_crafting",
          "total_job_crafting"
        ],
        "interpretations": [
          {
            "scoreKey": "task_crafting",
            "headline": "Task crafting frequency",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher scores indicate more frequent self-initiated changes to work tasks, approaches, scope, or task selection. The score describes frequency, not whether every change is beneficial.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Review which task changes are helping you use your skills and which may instead add unnecessary workload or role conflict."
              },
              {
                "category": "strategy",
                "text": "When experimenting with task changes, keep role expectations, student needs, workload, and available resources visible rather than assuming that more crafting is always better."
              }
            ]
          },
          {
            "scoreKey": "cognitive_crafting",
            "headline": "Cognitive crafting frequency",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher scores indicate more frequent reframing of the meaning, significance, or personal value of work. This is a frequency indicator, not a measure of optimism or mental health.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Notice when reframing helps reconnect daily work with purpose and when it may be masking structural problems that still require action."
              },
              {
                "category": "environment",
                "text": "Meaning-focused reflection should complement—not replace—attention to workload, staffing, role clarity, and other organisational conditions."
              }
            ]
          },
          {
            "scoreKey": "relational_crafting",
            "headline": "Relational crafting frequency",
            "source": {
              "type": "score_only"
            },
            "summary": "Higher scores indicate more frequent efforts to shape workplace relationships through connection, social participation, mentoring, or friendship.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Consider which work relationships provide useful support, learning, or collaboration and where professional boundaries still matter."
              },
              {
                "category": "support",
                "text": "Use the pattern to identify opportunities for mentoring, peer collaboration, or collegial support without treating social frequency as a performance target."
              }
            ]
          },
          {
            "scoreKey": "total_job_crafting",
            "headline": "Overall job crafting frequency",
            "source": {
              "type": "score_only"
            },
            "summary": "The overall score summarises the average frequency of task, cognitive, and relational crafting. Similar totals can reflect very different facet profiles.",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "Interpret the total only alongside the three facet scores to understand whether the pattern is primarily task, cognitive, or relational."
              },
              {
                "category": "environment",
                "text": "Pair the result with job demands, resources, burnout, and job satisfaction information when considering work-design changes."
              }
            ]
          }
        ],
        "limitations": [
          "JCQ is a self-report frequency measure; it does not establish whether a particular job-crafting behaviour is effective or appropriate.",
          "Higher scores are interpreted as more frequent job crafting, not universally better functioning.",
          "This construct is job crafting and must not be relabeled as Taking Charge, employee voice, proactive personality, organizational citizenship, or innovative work behavior.",
          "No norms, diagnostic thresholds, performance standards, or minimal-important-change values are included.",
          "The executable is the canonical English 1–6 form; no validated Chinese item wording is asserted."
        ],
        "disclaimer": "JCQ results are descriptive self-reports of how frequently a person shapes tasks, cognitions, and relationships at work. They are not a diagnosis, a teacher-performance rating, or evidence that more job crafting is always preferable."
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
            "itemCode": "JCQ-01",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-02",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-03",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-04",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-05",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-06",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-07",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-08",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-09",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-10",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-11",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-12",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-13",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-14",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-15",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "task_crafting": 1,
            "cognitive_crafting": 1,
            "relational_crafting": 1,
            "total_job_crafting": 1
          },
          "totalScoreKeys": [
            "task_crafting",
            "cognitive_crafting",
            "relational_crafting",
            "total_job_crafting"
          ]
        }
      },
      {
        "name": "all-highest",
        "answers": [
          {
            "itemCode": "JCQ-01",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-02",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-03",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-04",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-05",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-06",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-07",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-08",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-09",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-10",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-11",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-12",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-13",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-14",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-15",
            "responseValue": "6"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "task_crafting": 6,
            "cognitive_crafting": 6,
            "relational_crafting": 6,
            "total_job_crafting": 6
          },
          "totalScoreKeys": [
            "task_crafting",
            "cognitive_crafting",
            "relational_crafting",
            "total_job_crafting"
          ]
        }
      },
      {
        "name": "facet-separation",
        "answers": [
          {
            "itemCode": "JCQ-01",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-02",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-03",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-04",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-05",
            "responseValue": "6"
          },
          {
            "itemCode": "JCQ-06",
            "responseValue": "3"
          },
          {
            "itemCode": "JCQ-07",
            "responseValue": "3"
          },
          {
            "itemCode": "JCQ-08",
            "responseValue": "3"
          },
          {
            "itemCode": "JCQ-09",
            "responseValue": "3"
          },
          {
            "itemCode": "JCQ-10",
            "responseValue": "3"
          },
          {
            "itemCode": "JCQ-11",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-12",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-13",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-14",
            "responseValue": "1"
          },
          {
            "itemCode": "JCQ-15",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "task_crafting": 6,
            "cognitive_crafting": 3,
            "relational_crafting": 1,
            "total_job_crafting": 3.3333333333333335
          },
          "totalScoreKeys": [
            "task_crafting",
            "cognitive_crafting",
            "relational_crafting",
            "total_job_crafting"
          ]
        }
      },
      {
        "name": "missing-one-task",
        "answers": [
          {
            "itemCode": "JCQ-01",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-02",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-03",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-04",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-06",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-07",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-08",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-09",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-10",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-11",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-12",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-13",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-14",
            "responseValue": "4"
          },
          {
            "itemCode": "JCQ-15",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "task_crafting": null,
            "cognitive_crafting": 4,
            "relational_crafting": 4,
            "total_job_crafting": null
          },
          "totalScoreKeys": [
            "task_crafting",
            "cognitive_crafting",
            "relational_crafting",
            "total_job_crafting"
          ]
        }
      }
    ]
  }
} satisfies import('../../../onboarding/types').ScaleInstrumentSourceV1
