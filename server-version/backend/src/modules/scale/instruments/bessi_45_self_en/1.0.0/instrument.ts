// BESSI-45 self-report native DRAFT: verbatim items from the official sebskills.com form.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "bessi_45_self_en",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Behavioral, Emotional, and Social Skills Inventory — 45-item Self-Report",
      "abbreviation": "BESSI-45",
      "instrumentFamily": "BESSI"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "对社会、情绪及行为相关技能能做得多好的自我评价，分为自我管理、社交参与、合作、情绪复原、创新五个领域。",
      "constructLevel": "BROAD_DOMAIN",
      "constructOverlapTags": [
        "domain:sel",
        "license:noncommercial",
        "license:author_contact_required",
        "domain:social_emotional_competence",
        "population:k12",
        "response:student_self",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "construct:sel_bessi45_self_management",
        "construct:sel_bessi45_social_engagement",
        "construct:sel_bessi45_cooperation",
        "construct:sel_bessi45_emotional_resilience",
        "construct:sel_bessi45_innovation",
        "self_management",
        "social_engagement",
        "cooperation",
        "emotional_resilience",
        "innovation",
        "self_report"
      ]
    },
    "population": {
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "PARTIAL",
      "populationNotes": "官方说明 BESSI 为青少年和成人开发；本轮交付英文原题可执行草稿，不把成人证据外推到低年级儿童。中文版需按官网说明联系作者翻译授权。"
    },
    "administration": {
      "itemCount": 45,
      "estimatedMinutes": 8,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般技能自评，无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保持五点能力作答语义（Not at all well – Extremely well）；不改为频率或喜好。",
        "五个领域各 9 题，按官方计分页取均值；无反向题，不提供总分。"
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
          "notes": "结果用于个人反思，不解释为诊断或能力等级。"
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
        "evidenceId": "bessi-short-forms",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "Short-form BESSI validation samples",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Development and validation of 96-, 45-, and 20-item BESSI short forms.",
        "rating": "MIXED",
        "citation": "Sewell MN et al. Assessing Social, Emotional, and Behavioral Skills in Just a Few Minutes: 96-, 45-, and 20-Item Short Forms of the BESSI. Assessment. doi:10.1177/10731911241256434.",
        "doi": "10.1177/10731911241256434",
        "url": "https://doi.org/10.1177/10731911241256434"
      }
    ],
    "referenceApplicability": []
  },
  "usageRequirements": {
    "schemaVersion": 1,
    "policyVersion": "bessi-45-self-v1",
    "requiredRightsActions": [
      "electronicAdministration",
      "scoring",
      "display"
    ],
    "notes": [
      "官网声明：BESSI 供非商业用途（科学研究、项目评估、个人使用）自由使用，无需请求许可；商业使用需通过 essentialskillsconsulting.com 获取许可。",
      "题本页脚保留作者版权声明（©2019 Soto, Napolitano, Roberts）。",
      "翻译成新的语言或文化情境需联系作者；本版本仅交付英文原题，不含中文译题。"
    ]
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "bessi-45-self-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "bessi-45-self-v1",
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
    "text": "Here is a list of activities or things you could do. For each one, please select a response to indicate how well you can do that thing. For example, how well can you follow the instructions for an assignment? Note that how well you can do something may be different from how often you do it, or how much you like to do it. For each activity, you should rate how well you can do that thing.",
    "language": "en",
    "version": "1.0.0",
    "source": "官方自评表前导语（bessi-45_form_self.pdf，sebskills.com 公开提供）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "The Behavioral, Emotional, and Social Skills Inventory, 45-item Short Form (BESSI-45) — Self-Report Form",
        "citation": "Soto CJ, Napolitano CM, Roberts BW. BESSI-45 Self-Report Form and Scoring Information. sebskills.com.",
        "url": "https://www.sebskills.com/uploads/1/3/1/0/131015187/bessi-45_form_self.pdf",
        "publicationYear": 2019
      },
      "license": {
        "status": "unknown",
        "redistribution": "restricted",
        "note": "官网声明 BESSI 供非商业用途（科学研究、项目评估、个人使用）自由使用且无需请求许可；商业使用需许可；翻译需联系作者。题本页脚标注 ©2019 Soto, Napolitano, Roberts all rights reserved。redistribution 记为 restricted：允许范围限于非商业研究用途，商业部署前须取得许可。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "bessi_ability_1_5",
          "options": [
            {
              "value": "1",
              "label": "Not at all well",
              "score": 1
            },
            {
              "value": "2",
              "label": "Not very well",
              "score": 2
            },
            {
              "value": "3",
              "label": "Pretty well",
              "score": 3
            },
            {
              "value": "4",
              "label": "Very well",
              "score": 4
            },
            {
              "value": "5",
              "label": "Extremely well",
              "score": 5
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "BESSI-01",
          "content": "Plan out my time.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-02",
          "content": "Lead a group of people.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-03",
          "content": "Understand how other people feel.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-04",
          "content": "Calm down when I’m feeling anxious.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-05",
          "content": "Understand abstract ideas.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-06",
          "content": "Concentrate on a task.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-07",
          "content": "Express my thoughts and feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-08",
          "content": "See the good in people.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-09",
          "content": "Keep a positive attitude.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-10",
          "content": "Come up with new ideas.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-11",
          "content": "Keep track of my promises and commitments.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-12",
          "content": "Start a conversation.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-13",
          "content": "Cooperate with other people.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-14",
          "content": "Control my temper.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-15",
          "content": "Create art.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-16",
          "content": "Work toward my goals.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-17",
          "content": "Speak up when I disagree with others.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-18",
          "content": "Get along with people.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-19",
          "content": "Find reasons to feel good about myself.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-20",
          "content": "Learn about other cultures.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-21",
          "content": "Keep things neat and tidy.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-22",
          "content": "Maintain a high energy level.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-23",
          "content": "Take responsibility when I’ve made a mistake.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-24",
          "content": "Control my impulses.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-25",
          "content": "Make sense of complex information.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-26",
          "content": "Do tasks that are routine or repetitive.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-27",
          "content": "Assert myself as a leader.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-28",
          "content": "Sympathize with other people’s feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-29",
          "content": "Settle down when I’m feeling nervous.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-30",
          "content": "Discuss complicated topics and ideas.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-31",
          "content": "Double-check my work.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-32",
          "content": "Tell people how I am feeling.",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-33",
          "content": "Forgive people quickly.",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-34",
          "content": "Stay positive when something bad happens.",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-35",
          "content": "Invent things.",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-36",
          "content": "Follow the rules.",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-37",
          "content": "Talk to people.",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-38",
          "content": "Work as part of a group.",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-39",
          "content": "Stop myself from getting angry.",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-40",
          "content": "Draw or paint.",
          "type": "single",
          "required": true,
          "sortOrder": 39,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-41",
          "content": "Think things through carefully.",
          "type": "single",
          "required": true,
          "sortOrder": 40,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-42",
          "content": "Win arguments.",
          "type": "single",
          "required": true,
          "sortOrder": 41,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-43",
          "content": "Make a positive impression on people.",
          "type": "single",
          "required": true,
          "sortOrder": 42,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-44",
          "content": "See my good qualities.",
          "type": "single",
          "required": true,
          "sortOrder": 43,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        },
        {
          "itemCode": "BESSI-45",
          "content": "Understand people from different backgrounds.",
          "type": "single",
          "required": true,
          "sortOrder": 44,
          "responseSetKey": "bessi_ability_1_5",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "BESSI-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-35",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-36",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-39",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-40",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-41",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-42",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-43",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-44",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "BESSI-45",
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
            "key": "self_management",
            "type": "dimension",
            "label": "自我管理",
            "description": "该领域 9 个条目回答的平均分（1–5）；越高表示自评做得越好。",
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
                  "itemCode": "BESSI-01",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-06",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-11",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-16",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-21",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-26",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-31",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-36",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-41",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "social_engagement",
            "type": "dimension",
            "label": "社交参与",
            "description": "该领域 9 个条目回答的平均分（1–5）；越高表示自评做得越好。",
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
                  "itemCode": "BESSI-02",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-07",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-12",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-17",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-22",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-27",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-32",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-37",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-42",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "cooperation",
            "type": "dimension",
            "label": "合作",
            "description": "该领域 9 个条目回答的平均分（1–5）；越高表示自评做得越好。",
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
                  "itemCode": "BESSI-03",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-08",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-13",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-18",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-23",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-28",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-33",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-38",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-43",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "emotional_resilience",
            "type": "dimension",
            "label": "情绪复原",
            "description": "该领域 9 个条目回答的平均分（1–5）；越高表示自评做得越好。",
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
                  "itemCode": "BESSI-04",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-09",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-14",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-19",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-24",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-29",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-34",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-39",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-44",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "innovation",
            "type": "dimension",
            "label": "创新",
            "description": "该领域 9 个条目回答的平均分（1–5）；越高表示自评做得越好。",
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
                  "itemCode": "BESSI-05",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-10",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-15",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-20",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-25",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-30",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-35",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-40",
                  "weight": 1
                },
                {
                  "itemCode": "BESSI-45",
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
          "self_management",
          "social_engagement",
          "cooperation",
          "emotional_resilience",
          "innovation"
        ],
        "scoreOrder": [
          "self_management",
          "social_engagement",
          "cooperation",
          "emotional_resilience",
          "innovation"
        ],
        "interpretations": [
          {
            "scoreKey": "self_management",
            "headline": "管好该做的事",
            "source": {
              "type": "score_only"
            },
            "summary": "这组技能关于计划时间、保持专注、坚持目标和把事情做得整齐可靠。分数是这 9 项回答的平均；越高表示你自评做得越好。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "挑一件一直拖着的小事，把它拆成足够小的第一步，今天完成它。"
              }
            ]
          },
          {
            "scoreKey": "social_engagement",
            "headline": "主动与人连接",
            "source": {
              "type": "score_only"
            },
            "summary": "这组技能关于开启交谈、表达想法和感受、在集体里发声和带动别人。分数越高表示你自评越自在。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "本周主动开启一次你通常等别人先开口的对话。"
              }
            ]
          },
          {
            "scoreKey": "cooperation",
            "headline": "与人合作相处",
            "source": {
              "type": "score_only"
            },
            "summary": "这组技能关于合作、体谅他人、快速原谅和守住承诺。分数越高表示你自评越能与人顺畅相处。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想一次与人的小摩擦：如果重来一次，你会怎么做？"
              }
            ]
          },
          {
            "scoreKey": "emotional_resilience",
            "headline": "从情绪里恢复",
            "source": {
              "type": "score_only"
            },
            "summary": "这组技能关于在紧张、挫折或坏消息后稳住自己、保持积极。分数越高表示你自评恢复得越快。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "下次感到焦虑时，试一个你没用过的平复方法，记下它的效果。"
              }
            ]
          },
          {
            "scoreKey": "innovation",
            "headline": "想出新点子",
            "source": {
              "type": "score_only"
            },
            "summary": "这组技能关于产生新想法、理解复杂概念和用艺术方式表达。分数越高表示你自评越常这样做。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "给一个老问题想三个不同的新办法，不管好坏都写下来。"
              }
            ]
          }
        ],
        "limitations": [
          "这是自评，反映一次作答；自评做得好不等于别人眼中做得如何。",
          "官方说明 BESSI 为青少年和成人开发；对低年级儿童的适用性证据有限。",
          "题文为官网公开英文原题；本版本未包含中文译题，翻译需按官网说明联系作者。",
          "没有适用于你的常模或诊断阈值。"
        ],
        "disclaimer": "这份报告用于个人反思，不用于诊断或排名。"
      },
      "referencePolicy": {
        "type": "none"
      }
    },
    "goldenCases": [
      {
        "name": "minimum-keyed",
        "answers": [
          {
            "itemCode": "BESSI-01",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-02",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-03",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-04",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-05",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-06",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-07",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-08",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-09",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-10",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-11",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-12",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-13",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-14",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-15",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-16",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-17",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-18",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-19",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-20",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-21",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-22",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-23",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-24",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-25",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-26",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-27",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-28",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-29",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-30",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-31",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-32",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-33",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-34",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-35",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-36",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-37",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-38",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-39",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-40",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-41",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-42",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-43",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-44",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-45",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_management": 1,
            "social_engagement": 1,
            "cooperation": 1,
            "emotional_resilience": 1,
            "innovation": 1
          },
          "totalScoreKeys": [
            "self_management",
            "social_engagement",
            "cooperation",
            "emotional_resilience",
            "innovation"
          ]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          {
            "itemCode": "BESSI-01",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-02",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-03",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-04",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-05",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-06",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-07",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-08",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-09",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-10",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-11",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-12",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-13",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-14",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-15",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-16",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-17",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-18",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-19",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-20",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-21",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-22",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-23",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-24",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-25",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-26",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-27",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-28",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-29",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-30",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-31",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-32",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-33",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-34",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-35",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-36",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-37",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-38",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-39",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-40",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-41",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-42",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-43",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-44",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-45",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_management": 5,
            "social_engagement": 5,
            "cooperation": 5,
            "emotional_resilience": 5,
            "innovation": 5
          },
          "totalScoreKeys": [
            "self_management",
            "social_engagement",
            "cooperation",
            "emotional_resilience",
            "innovation"
          ]
        }
      },
      {
        "name": "sample-cycled",
        "answers": [
          {
            "itemCode": "BESSI-01",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-02",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-03",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-04",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-05",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-06",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-07",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-08",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-09",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-10",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-11",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-12",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-13",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-14",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-15",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-16",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-17",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-18",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-19",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-20",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-21",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-22",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-23",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-24",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-25",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-26",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-27",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-28",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-29",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-30",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-31",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-32",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-33",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-34",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-35",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-36",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-37",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-38",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-39",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-40",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-41",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-42",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-43",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-44",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-45",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "self_management": 1,
            "social_engagement": 2,
            "cooperation": 3,
            "emotional_resilience": 4,
            "innovation": 5
          },
          "totalScoreKeys": [
            "self_management",
            "social_engagement",
            "cooperation",
            "emotional_resilience",
            "innovation"
          ]
        }
      },
      {
        "name": "missing-domain-item",
        "answers": [
          {
            "itemCode": "BESSI-02",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-03",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-04",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-05",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-06",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-07",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-08",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-09",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-10",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-11",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-12",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-13",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-14",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-15",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-16",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-17",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-18",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-19",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-20",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-21",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-22",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-23",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-24",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-25",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-26",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-27",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-28",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-29",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-30",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-31",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-32",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-33",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-34",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-35",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-36",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-37",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-38",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-39",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-40",
            "responseValue": "5"
          },
          {
            "itemCode": "BESSI-41",
            "responseValue": "1"
          },
          {
            "itemCode": "BESSI-42",
            "responseValue": "2"
          },
          {
            "itemCode": "BESSI-43",
            "responseValue": "3"
          },
          {
            "itemCode": "BESSI-44",
            "responseValue": "4"
          },
          {
            "itemCode": "BESSI-45",
            "responseValue": "5"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "self_management": null,
            "social_engagement": 2,
            "cooperation": 3,
            "emotional_resilience": 4,
            "innovation": 5
          },
          "totalScoreKeys": [
            "self_management",
            "social_engagement",
            "cooperation",
            "emotional_resilience",
            "innovation"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
