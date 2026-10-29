import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text transcribed from the Beck Institute SAS packet (1983 form; Clark et al. factor tables); license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "sas60",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Sociotropy-Autonomy Scale (SAS), 60-item 1983 form",
      "abbreviation": "SAS",
      "instrumentFamily": "Sociotropy-Autonomy Scale"
    },
    "construct": {
      "primaryDomain": "PERSONALITY",
      "secondaryDomains": [
        "SOCIAL_EMOTIONAL"
      ],
      "constructDefinition": "自评社会依赖（sociotropy：在意认可、依恋、取悦）与自主性（autonomy：个人成就、行动自由、独处偏好）两个独立维度的信念与行为倾向。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:cbt",
        "construct:cbt_sas_sociotropy_autonomy",
        "sociotropy",
        "autonomy",
        "adult_self_report",
        "self_report",
        "use:reflection",
        "use:research",
        "language_validation:english_original",
        "license:license_unverified"
      ]
    },
    "population": {
      "populationNotes": "原版开发基于成人样本（抑郁易感性研究）；未建立儿童青少年常模。社会依赖与自主性是两个独立维度而非对立两端，可同时高分。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 60,
      "estimatedMinutes": 15,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般自我描述（“该陈述在多大比例的时间里适用于你”），无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原60题顺序与五档百分比选项（0%/25%/50%/75%/100%）。",
        "原表第10题作 “I like to left alone”（缺 be），按原表逐字保留；同资料包论文版本作 “I like to be left alone.”，差异已记录。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版用于抑郁易感性与CBT概念化研究；社会依赖与自主性各自独立计分。"
        },
        {
          "use": "INDIVIDUAL_REFLECTION",
          "evidenceStatus": "EVIDENCE_UNKNOWN",
          "notes": "维度强度反馈不构成人格诊断。"
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
        "evidenceId": "clark-beck-sas-development",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US adult samples (student and clinical, factor-analytic N=378)",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Factor-analytic development of the SAS: three sociotropy and three autonomy factors; scale and subscale alphas reported in the packet article.",
        "rating": "SUFFICIENT",
        "citation": "Beck AT, Epstein N, Harrison G, Emery GD. (1983). Development of the Sociotropy-Autonomy Scale: A preliminary report. Center for Cognitive Therapy, University of Pennsylvania Medical School, Philadelphia. 量表构成另与同一资料包内 Clark 等 “Development of the Sociotropy-Autonomy Scale” 的因子表（Tables 2–3）交叉核对。",
        "url": "https://beckinstitute.org/wp-content/uploads/2021/06/SAS-Full-Documents.pdf",
        "notes": "分量表题项归属以该文Tables 2–3为准（10/13/7 + 12/12/6，恰覆盖60题）；修订版SAS（Sociotropy/Solitude/Independence三量表）为另一版本，未实现。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "sas60-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "sas60-en-v1",
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
    "text": "Please indicate what percentage of the time each of the statements below applies to you, by using the scale to the left of the items. Choose the percentage that comes closest to how often the item describes you.",
    "language": "en",
    "version": "1.0.0",
    "source": "Beck Institute SAS 表单第1页 INSTRUCTIONS 段逐字转录（表头 SAS II/NE/5/83）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Sociotropy-Autonomy Scale (SAS), 60-item 1983 form",
        "citation": "Beck AT, Epstein N, Harrison G, Emery GD. (1983). Development of the Sociotropy-Autonomy Scale: A preliminary report. Center for Cognitive Therapy, University of Pennsylvania Medical School, Philadelphia. 量表构成另与同一资料包内 Clark 等 “Development of the Sociotropy-Autonomy Scale” 的因子表（Tables 2–3）交叉核对。",
        "url": "https://beckinstitute.org/wp-content/uploads/2021/06/SAS-Full-Documents.pdf",
        "publicationYear": 1983
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "表单与论文来自 Beck Institute 评估工具页公开下载（SAS-Full-Documents）；页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布前须与 Beck Institute 确认权利。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "sas_pct_0_4",
          "options": [
            {
              "value": "0",
              "label": "0% (Not at all)",
              "score": 0
            },
            {
              "value": "1",
              "label": "25%",
              "score": 1
            },
            {
              "value": "2",
              "label": "50%",
              "score": 2
            },
            {
              "value": "3",
              "label": "75%",
              "score": 3
            },
            {
              "value": "4",
              "label": "100% (Always)",
              "score": 4
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "SAS-01",
          "content": "I feel I have to be nice to other people.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-02",
          "content": "It is important to me to be free and independent.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-03",
          "content": "It is more important that I know I've done a good job than having others know it.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-04",
          "content": "Being able to share experiences with other people makes them much more enjoyable for me.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-05",
          "content": "I am afraid of hurting other people's feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-06",
          "content": "It bothers me when people try to direct my behavior or activities.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-07",
          "content": "I find it difficult to say \"no\" to people.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-08",
          "content": "I feel bad if I do not have some social plans for the weekend.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-09",
          "content": "I prize being a unique individual more than being a member of a group.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-10",
          "content": "When I feel sick, I like to left alone.",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-11",
          "content": "I am concerned that if people knew my faults or weaknesses they would not like me.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-12",
          "content": "If I think I am right about something, I feel comfortable expressing myself even if others don't like it.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-13",
          "content": "When visiting people, I get fidgety when sitting around talking and would rather get up and do something.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-14",
          "content": "It is more important to meet your own objectives on a task than to meet another person's objectives.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-15",
          "content": "I do things that are not in my best interest in order to please others.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-16",
          "content": "I like to take long walks by myself.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-17",
          "content": "I am more concerned that people like me than I am about making important achievements.",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-18",
          "content": "I would be uncomfortable dining out in a restaurant by myself.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-19",
          "content": "I don't enjoy what I am doing when I don't feel that someone in my life really cares about me.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-20",
          "content": "I am not influenced by others in what I decide to do.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-21",
          "content": "It is very important that I feel free to get up and go wherever I want.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-22",
          "content": "I value work accomplishments more than I value making friends.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-23",
          "content": "I find it is of importance to be in control of my emotions.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-24",
          "content": "I get uncomfortable when I am not sure how I am expected to behave in the presence of other people.",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-25",
          "content": "I feel more comfortable helping others than receiving help.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-26",
          "content": "It would not be much fun for me to travel to a new place all alone.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-27",
          "content": "If a friend has not called for a while, I get worried that he or she has forgotten me.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-28",
          "content": "It is more important to be active and doing things than having close relations with other people.",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-29",
          "content": "I get uncomfortable around a person who does not clearly like me.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-30",
          "content": "If a goal is important to me, I will pursue it even if it may make other people uncomfortable.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-31",
          "content": "I find it difficult to be separated from people I love.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-32",
          "content": "When I achieve a goal I get more satisfaction from reaching the goal than from any praise I might get.",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-33",
          "content": "I censor what I say because I am concerned that the other person may disapprove or disagree.",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-34",
          "content": "I get lonely when I am home by myself at night.",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-35",
          "content": "I often find myself thinking about friends or family.",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-36",
          "content": "I prefer to make my own plans, so I am not controlled by others.",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-37",
          "content": "I can comfortably be by myself all day without feeling a need to have someone around.",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-38",
          "content": "If somebody criticizes my appearance, I feel I am not attractive to other people.",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-39",
          "content": "It is more important to get a job done than to worry about people's reactions.",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-40",
          "content": "I like to spend my free time with others.",
          "type": "single",
          "required": true,
          "sortOrder": 39,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-41",
          "content": "I don't like to answer personal questions because they feel like an invasion of my privacy.",
          "type": "single",
          "required": true,
          "sortOrder": 40,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-42",
          "content": "When I have a problem, I like to go off on my own and think it through rather than being influenced by others.",
          "type": "single",
          "required": true,
          "sortOrder": 41,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-43",
          "content": "In relationships, people often are too demanding of each other.",
          "type": "single",
          "required": true,
          "sortOrder": 42,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-44",
          "content": "I am uneasy when I cannot tell whether or not someone I've met likes me.",
          "type": "single",
          "required": true,
          "sortOrder": 43,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-45",
          "content": "I set my own standards and goals for myself rather than accepting those of other people.",
          "type": "single",
          "required": true,
          "sortOrder": 44,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-46",
          "content": "I am more apologetic to others than I need to be.",
          "type": "single",
          "required": true,
          "sortOrder": 45,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-47",
          "content": "It is important to me to be liked and approved of by others.",
          "type": "single",
          "required": true,
          "sortOrder": 46,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-48",
          "content": "I enjoy accomplishing things more than being given credit for them.",
          "type": "single",
          "required": true,
          "sortOrder": 47,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-49",
          "content": "Having close bonds with other people makes me feel secure.",
          "type": "single",
          "required": true,
          "sortOrder": 48,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-50",
          "content": "When I am with other people, I look for signs whether or not they like being with me.",
          "type": "single",
          "required": true,
          "sortOrder": 49,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-51",
          "content": "I like to go off on my own, exploring new places -- without other people.",
          "type": "single",
          "required": true,
          "sortOrder": 50,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-52",
          "content": "If I think somebody may be upset at me, I want to apologize.",
          "type": "single",
          "required": true,
          "sortOrder": 51,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-53",
          "content": "I like to be certain that there is somebody close I can contact in case something unpleasant happens to me.",
          "type": "single",
          "required": true,
          "sortOrder": 52,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-54",
          "content": "I feel confined when I have to sit through a long meeting.",
          "type": "single",
          "required": true,
          "sortOrder": 53,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-55",
          "content": "I don't like people to invade my privacy.",
          "type": "single",
          "required": true,
          "sortOrder": 54,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-56",
          "content": "I feel uncomfortable being a nonconformist.",
          "type": "single",
          "required": true,
          "sortOrder": 55,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-57",
          "content": "The worst part about being in jail would be not being able to move around freely.",
          "type": "single",
          "required": true,
          "sortOrder": 56,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-58",
          "content": "The worst part about growing old is being left alone.",
          "type": "single",
          "required": true,
          "sortOrder": 57,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-59",
          "content": "I worry that somebody I love will die.",
          "type": "single",
          "required": true,
          "sortOrder": 58,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "SAS-60",
          "content": "The possibility of being rejected by others for standing up for my rights would not stop me.",
          "type": "single",
          "required": true,
          "sortOrder": 59,
          "responseSetKey": "sas_pct_0_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "SAS-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-35",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-36",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-39",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-40",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-41",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-42",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-43",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-44",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-45",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-46",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-47",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-48",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-49",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-50",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-51",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-52",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-53",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-54",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-55",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-56",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-57",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-58",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-59",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "SAS-60",
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
            "key": "soc_concern_disapproval",
            "type": "dimension",
            "label": "在意不赞成",
            "description": "相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "SAS-50",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-44",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-38",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-24",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-11",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-33",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-29",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-17",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-27",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-18",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "soc_attachment_separation",
            "type": "dimension",
            "label": "依恋/分离担忧",
            "description": "相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "SAS-31",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-49",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-34",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-35",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-04",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-53",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-40",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-19",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-26",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-58",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-59",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-47",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-08",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "soc_pleasing_others",
            "type": "dimension",
            "label": "取悦他人",
            "description": "相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "SAS-05",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-01",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-46",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-07",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-52",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-15",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-56",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "aut_individualistic_achievement",
            "type": "dimension",
            "label": "个人成就",
            "description": "相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "SAS-60",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-32",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-14",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-03",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-12",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-09",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-30",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-48",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-45",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-39",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-20",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-02",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "aut_mobility_freedom",
            "type": "dimension",
            "label": "行动自由/不受控制",
            "description": "相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "SAS-21",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-55",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-54",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-13",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-57",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-41",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-28",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-23",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-36",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-43",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-06",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-22",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "aut_preference_solitude",
            "type": "dimension",
            "label": "独处偏好",
            "description": "相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。",
            "direction": "higher_is_more",
            "canonical": false,
            "displayPrecision": 0,
            "missingPolicy": {
              "type": "complete_required"
            },
            "source": {
              "type": "items",
              "items": [
                {
                  "itemCode": "SAS-16",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-42",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-10",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-37",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-25",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-51",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "sociotropy",
            "type": "total",
            "label": "社会依赖总分（30题）",
            "description": "相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。",
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
                  "itemCode": "SAS-50",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-44",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-38",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-24",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-11",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-33",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-29",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-17",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-27",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-18",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-31",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-49",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-34",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-35",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-04",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-53",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-40",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-19",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-26",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-58",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-59",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-47",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-08",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-05",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-01",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-46",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-07",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-52",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-15",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-56",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "autonomy",
            "type": "total",
            "label": "自主性总分（30题）",
            "description": "相关题作答求和（无反向题）；必须完整作答。原始选项为时间百分比（0%/25%/50%/75%/100%），产品采用线性等价的0–4计分。",
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
                  "itemCode": "SAS-60",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-32",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-14",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-03",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-12",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-09",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-30",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-48",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-45",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-39",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-20",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-02",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-21",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-55",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-54",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-13",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-57",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-41",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-28",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-23",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-36",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-43",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-06",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-22",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-16",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-42",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-10",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-37",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-25",
                  "weight": 1
                },
                {
                  "itemCode": "SAS-51",
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
          "sociotropy",
          "autonomy"
        ],
        "scoreOrder": [
          "soc_concern_disapproval",
          "soc_attachment_separation",
          "soc_pleasing_others",
          "aut_individualistic_achievement",
          "aut_mobility_freedom",
          "aut_preference_solitude",
          "sociotropy",
          "autonomy"
        ],
        "interpretations": [
          {
            "scoreKey": "sociotropy",
            "headline": "在关系里的我",
            "source": {
              "type": "score_only"
            },
            "summary": "这份总分汇总了你在多大程度上“靠他人的认可、陪伴与满意来定位自己”。依赖关系不是缺点；值得留意的是当它变成唯一的价值来源时，人会活得很紧。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "过去一周，你有哪些决定是为了让别人满意而做的？"
              },
              {
                "category": "strategy",
                "text": "为一件小事练习“先问自己想要什么”，再考虑别人，并记录感受差异。"
              }
            ]
          },
          {
            "scoreKey": "autonomy",
            "headline": "独立做事的我",
            "source": {
              "type": "score_only"
            },
            "summary": "这份总分汇总了你在多大程度上“靠自己的目标、标准与自由来定位自己”。独立是能力；但当它变成“绝不能依靠任何人”时，支持就进不来了。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次主动求助是什么时候？结果如何？"
              },
              {
                "category": "strategy",
                "text": "选一件有难度的事，尝试向一位信任的人求助一次，观察关系与结果。"
              }
            ]
          },
          {
            "scoreKey": "soc_concern_disapproval",
            "headline": "“别人会怎么看”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你是否在意被否定、被冷淡，是否会寻找他人喜欢自己的信号。在意评价很普遍；差别只在它占用多少注意力。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "过去一周，你花了多少精力揣测别人对你的看法？"
              },
              {
                "category": "strategy",
                "text": "下次揣测时改为一问：有什么证据？有别的解释吗？"
              }
            ]
          },
          {
            "scoreKey": "soc_attachment_separation",
            "headline": "“怕分开”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注与亲近之人的联结和分离焦虑。珍视关系是健康的；当分离的想法持续带来不安时，可以练习把安全感放回自己身上一部分。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "独处时你最怕的是什么？那种感觉从什么时候开始？"
              },
              {
                "category": "strategy",
                "text": "为“一个人的一晚”设计一个让自己舒服的小仪式，练习与自己相处。"
              }
            ]
          },
          {
            "scoreKey": "soc_pleasing_others",
            "headline": "“让所有人都满意”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题统计为了让别人舒服而委屈自己的频率。善意是优点；无底线的取悦会让人忘了自己的需要。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次说“不”是什么时候？说出口时感觉如何？"
              },
              {
                "category": "strategy",
                "text": "从小事开始练习拒绝：先延迟回答（“我看一下再答复你”），再决定。"
              }
            ]
          },
          {
            "scoreKey": "aut_individualistic_achievement",
            "headline": "“做成事最重要”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你多大程度上以目标与成就定义自己，而非他人的夸奖。成就感是动力；只靠它定位价值，低谷期会格外难熬。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "上一次没有“做成什么”的一周，你如何评价自己？"
              },
              {
                "category": "strategy",
                "text": "练习“过程式自我肯定”：记录一件只因投入而值得的事。"
              }
            ]
          },
          {
            "scoreKey": "aut_mobility_freedom",
            "headline": "“谁也别管我”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你对行动自由和不受控制的在意。自主感很重要；留意它是否让你把普通的关心也当成干涉。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次“感觉被管”的时刻，对方实际做了什么？"
              },
              {
                "category": "strategy",
                "text": "区分“干涉”与“关心”：写下三个例子，分别问自己对方的意图还有什么可能。"
              }
            ]
          },
          {
            "scoreKey": "aut_preference_solitude",
            "headline": "“独处充电”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组题关注你从独处中获得恢复的倾向。喜欢独处没有问题；关键是这是选择，还是回避的出口。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "你上一次主动社交是什么时候？是选择还是压力？"
              },
              {
                "category": "strategy",
                "text": "记录一周的独处/社交时间，看看比例是否接近你真正想要的样子。"
              }
            ]
          }
        ],
        "limitations": [
          "社会依赖与自主性是两个独立维度（原研究相关仅轻度负相关），不是对立两端，可同时高分。",
          "分量表构成取自资料包论文因子表；修订版SAS（Sociotropy/Solitude/Independence）为另一版本，未实现。",
          "原始选项为时间百分比，产品采用0–4线性等价计分，已记录。",
          "没有常模、百分位或临床界值；分数不能用于人格诊断。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。",
          "题本转录自 Beck Institute 公开下载资料，权利状态未确认。"
        ],
        "disclaimer": "仅供认识与反思，不用于诊断、人格评判、高风险决策或替代专业帮助。"
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
            "itemCode": "SAS-01",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-02",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-03",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-04",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-05",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-06",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-07",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-08",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-09",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-10",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-11",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-12",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-13",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-14",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-15",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-16",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-17",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-18",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-19",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-20",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-21",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-22",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-23",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-24",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-25",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-26",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-27",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-28",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-29",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-30",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-31",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-32",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-33",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-34",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-35",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-36",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-37",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-38",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-39",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-40",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-41",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-42",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-43",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-44",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-45",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-46",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-47",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-48",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-49",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-50",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-51",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-52",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-53",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-54",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-55",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-56",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-57",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-58",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-59",
            "responseValue": "0"
          },
          {
            "itemCode": "SAS-60",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "soc_concern_disapproval": 0,
            "soc_attachment_separation": 0,
            "soc_pleasing_others": 0,
            "aut_individualistic_achievement": 0,
            "aut_mobility_freedom": 0,
            "aut_preference_solitude": 0,
            "sociotropy": 0,
            "autonomy": 0
          },
          "totalScoreKeys": [
            "sociotropy",
            "autonomy"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "SAS-01",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-02",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-03",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-04",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-05",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-06",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-07",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-08",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-09",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-10",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-11",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-12",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-13",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-14",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-15",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-16",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-17",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-18",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-19",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-20",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-21",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-22",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-23",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-24",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-25",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-26",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-27",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-28",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-29",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-30",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-31",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-32",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-33",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-34",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-35",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-36",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-37",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-38",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-39",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-40",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-41",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-42",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-43",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-44",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-45",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-46",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-47",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-48",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-49",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-50",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-51",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-52",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-53",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-54",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-55",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-56",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-57",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-58",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-59",
            "responseValue": "4"
          },
          {
            "itemCode": "SAS-60",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "soc_concern_disapproval": 40,
            "soc_attachment_separation": 52,
            "soc_pleasing_others": 28,
            "aut_individualistic_achievement": 48,
            "aut_mobility_freedom": 48,
            "aut_preference_solitude": 24,
            "sociotropy": 120,
            "autonomy": 120
          },
          "totalScoreKeys": [
            "sociotropy",
            "autonomy"
          ]
        }
      },
      {
        "name": "sample-soc2-aut3",
        "answers": [
          {
            "itemCode": "SAS-01",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-03",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-04",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-05",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-07",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-08",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-09",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-11",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-12",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-13",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-14",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-15",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-16",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-17",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-18",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-19",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-20",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-21",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-22",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-23",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-24",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-25",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-26",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-27",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-28",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-29",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-30",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-31",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-32",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-33",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-34",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-35",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-36",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-37",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-38",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-39",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-40",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-41",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-42",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-43",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-44",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-45",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-46",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-47",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-48",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-49",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-50",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-51",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-52",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-53",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-54",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-55",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-56",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-57",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-58",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-59",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-60",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "soc_concern_disapproval": 20,
            "soc_attachment_separation": 26,
            "soc_pleasing_others": 14,
            "aut_individualistic_achievement": 36,
            "aut_mobility_freedom": 36,
            "aut_preference_solitude": 18,
            "sociotropy": 60,
            "autonomy": 90
          },
          "totalScoreKeys": [
            "sociotropy",
            "autonomy"
          ]
        }
      },
      {
        "name": "missing-sociotropy",
        "answers": [
          {
            "itemCode": "SAS-01",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-02",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-03",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-04",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-05",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-06",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-07",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-08",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-09",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-10",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-11",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-12",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-13",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-14",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-15",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-16",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-17",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-18",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-19",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-20",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-21",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-22",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-23",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-24",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-25",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-26",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-27",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-28",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-29",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-30",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-32",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-33",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-34",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-35",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-36",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-37",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-38",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-39",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-40",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-41",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-42",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-43",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-44",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-45",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-46",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-47",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-48",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-49",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-50",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-51",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-52",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-53",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-54",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-55",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-56",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-57",
            "responseValue": "3"
          },
          {
            "itemCode": "SAS-58",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-59",
            "responseValue": "2"
          },
          {
            "itemCode": "SAS-60",
            "responseValue": "3"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "soc_concern_disapproval": 20,
            "soc_attachment_separation": null,
            "soc_pleasing_others": 14,
            "aut_individualistic_achievement": 36,
            "aut_mobility_freedom": 36,
            "aut_preference_solitude": 18,
            "sociotropy": null,
            "autonomy": 90
          },
          "totalScoreKeys": [
            "sociotropy",
            "autonomy"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
