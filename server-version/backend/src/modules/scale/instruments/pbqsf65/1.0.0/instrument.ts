import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

// English item text © 1995 Aaron T. Beck & Judith S. Beck, Beck Institute; transcribed from the officially posted scanned form, license unverified.
export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "pbqsf65",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Personality Belief Questionnaire – Short Form (PBQ-SF), 65 items",
      "abbreviation": "PBQ-SF",
      "instrumentFamily": "Personality Belief Questionnaire"
    },
    "construct": {
      "primaryDomain": "PERSONALITY",
      "secondaryDomains": [
        "BEHAVIORAL_DIFFICULTIES"
      ],
      "constructDefinition": "自评与各人格风格相关的功能失调信念强度（十个量表）；量表名指信念维度，不构成人格障碍诊断。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:cbt",
        "construct:cbt_pbq_personality_beliefs",
        "dysfunctional_attitudes",
        "personality_beliefs",
        "adult_clinical_population",
        "self_report",
        "use:research",
        "language_validation:english_original",
        "license:license_unverified"
      ]
    },
    "population": {
      "populationNotes": "PBQ 为精神科门诊成人患者设计（Z分数常模基于683名混合诊断门诊患者，仅记录不实现）；未建立儿童青少年常模。本工具面向临床研究情境，不得用于普通学生筛查或人格评判。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "ESTABLISHED"
    },
    "administration": {
      "itemCount": 65,
      "estimatedMinutes": 15,
      "administrationModes": [
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "一般信念（“多数时候”你对每条陈述的相信程度），无指定回忆时段",
      "requiredTraining": true,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "保留原65题顺序与0–4信念强度选项（4=完全相信 … 0=完全不相信）。",
        "表单开头另有示例条目（The world is a dangerous place.），不属于65题，未纳入。",
        "原文疑似印刷/拼写问题按原样保留：第13题 manipuate、第41题 dealines、第42题 what ever；第56题尾部印刷退化，按正式发表文本 something bad happens 录入并记录。"
      ]
    },
    "intendedUse": {
      "intendedUses": [
        {
          "use": "RESEARCH",
          "evidenceStatus": "SUPPORTED",
          "notes": "原版用于人格风格相关信念的研究与临床概念化；量表与PDQ-R等指标相关中等。"
        }
      ],
      "forbiddenUses": [
        "DIAGNOSIS",
        "HIGH_STAKES_SELECTION",
        "SCHOOL_RANKING",
        "TEACHER_ACCOUNTABILITY",
        "UNSUPPORTED_GROUP_COMPARISON",
        "INDIVIDUAL_REFLECTION"
      ]
    },
    "evidence": [
      {
        "evidenceId": "bhar-beck-butler-pbq-review",
        "evidenceType": "STRUCTURAL_VALIDITY",
        "population": "US adult psychiatric outpatients (largest study N=756) and community adults",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Psychometric overview of the PBQ/PBQ-SF: internal consistency, test-retest and criterion validity across studies; included in the same distribution packet.",
        "rating": "SUFFICIENT",
        "citation": "Personality Belief Questionnaire – Short Form (PBQ-SF), © 1995 Aaron T. Beck, M.D. & Judith S. Beck, Ph.D., Beck Institute for Cognitive Therapy and Research; scoring key by A.C. Butler (6/00) distributed in the same packet. 心理测量学研究概述见同一资料包内 Bhar, Beck & Butler, \"Beliefs in personality disorders: An overview of the Personality Beliefs Questionnaire\".",
        "url": "https://beckinstitute.org/wp-content/uploads/2021/06/PBQ-SF-Full-Documents.pdf",
        "notes": "量表计分键与Z分数公式来自随表分发的官方Scoring Key；Z分数基于门诊常模，本实现仅提供原始分。对非临床人群的效度证据较弱（原综述明确指出）。"
      }
    ],
    "referenceApplicability": []
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "pbqsf65-en-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "pbqsf65-en-v1",
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
    "text": "Please read the statements below and rate HOW MUCH YOU BELIEVE EACH ONE. Try to judge how you feel about each statement MOST OF THE TIME. Do not leave any statements blank.",
    "language": "en",
    "version": "1.0.0",
    "source": "Beck Institute PBQ-SF 表单第1页指导语，逐字转录（© 1995 Aaron T. Beck & Judith S. Beck）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Personality Belief Questionnaire – Short Form (PBQ-SF)",
        "citation": "Personality Belief Questionnaire – Short Form (PBQ-SF), © 1995 Aaron T. Beck, M.D. & Judith S. Beck, Ph.D., Beck Institute for Cognitive Therapy and Research; scoring key by A.C. Butler (6/00) distributed in the same packet. 心理测量学研究概述见同一资料包内 Bhar, Beck & Butler, \"Beliefs in personality disorders: An overview of the Personality Beliefs Questionnaire\".",
        "url": "https://beckinstitute.org/wp-content/uploads/2021/06/PBQ-SF-Full-Documents.pdf",
        "publicationYear": 1995
      },
      "license": {
        "status": "unknown",
        "redistribution": "unknown",
        "note": "表单页脚 © 1995 by Aaron T. Beck, M.D. & Judith S. Beck, Ph.D., Bala Cynwyd, PA: Beck Institute for Cognitive Therapy and Research；Beck Institute 评估工具页公开提供下载，页面未列明再分发、翻译或商业条款。未取得授权声明；正式发布前须与 Beck Institute 确认权利。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "pbq_belief_0_4",
          "options": [
            {
              "value": "4",
              "label": "I Believe it Totally",
              "score": 4
            },
            {
              "value": "3",
              "label": "I Believe it Very Much",
              "score": 3
            },
            {
              "value": "2",
              "label": "I Believe it Moderately",
              "score": 2
            },
            {
              "value": "1",
              "label": "I Believe it Slightly",
              "score": 1
            },
            {
              "value": "0",
              "label": "I Don’t Believe it at all",
              "score": 0
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "PBQ-01",
          "content": "Being exposed as inferior or inadequate will be intolerable.",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-02",
          "content": "I should avoid unpleasant situations at all cost.",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-03",
          "content": "If people act friendly, they may be trying to use or exploit me.",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-04",
          "content": "I have to resist the domination of authorities but at the same time maintain their approval and acceptance.",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-05",
          "content": "I cannot tolerate unpleasant feelings.",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-06",
          "content": "Flaws, defects, or mistakes are intolerable.",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-07",
          "content": "Other people are often too demanding.",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-08",
          "content": "I should be the center of attention.",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-09",
          "content": "If I don’t have systems, everything will fall apart.",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-10",
          "content": "It’s intolerable if I’m not accorded my due respect or don’t get what I’m entitled to",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-11",
          "content": "It is important to do a perfect job on everything.",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-12",
          "content": "I enjoy doing things more by myself than with other people.",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-13",
          "content": "Others will try to use me or manipuate me if I don’t watch out.",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-14",
          "content": "Other people have hidden motives.",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-15",
          "content": "The worst possible thing would be to be abandoned.",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-16",
          "content": "Other people should recognize how special I am.",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-17",
          "content": "Other people will deliberately try to demean",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-18",
          "content": "I need others to help me make decisions or tell me what to do.",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-19",
          "content": "Details are extremely important.",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-20",
          "content": "If I regard people as too bossy, I have a right to disregard their demands.",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-21",
          "content": "Authority figures tend to be intrusive, demanding, interfering, and controlling.",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-22",
          "content": "The way to get what I want is to dazzle or amuse people.",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-23",
          "content": "I should do whatever I can get away with.",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-24",
          "content": "If other people find out things about me, they will use them against me",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-25",
          "content": "Relationships are messy and interfere with freedom.",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-26",
          "content": "Only people as brilliant as I am understand me.",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-27",
          "content": "Since I am so superior, I am entitled to special treatment and privileges.",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-28",
          "content": "It is important for me to be free and independent of others",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-29",
          "content": "In many situations, I am better off to be left alone.",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-30",
          "content": "It is necessary to stick to the highest standards at all times, or things will fall apart.",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-31",
          "content": "Unpleasant feelings will escalate and get out of control.",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-32",
          "content": "We live in a jungle and the strong person is the one who survives.",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-33",
          "content": "I should avoid situations in which I attract attention, or be as inconspicuous as possible.",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-34",
          "content": "If I don’t keep others engaged with me, they won’t like me.",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-35",
          "content": "If I want something, I should do whatever is necessary to get it.",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-36",
          "content": "It’s better to be alone than to feel \"stuck\" with other people.",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-37",
          "content": "Unless I entertain or impress people, I am nothing.",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-38",
          "content": "People will get at me if I don’t get them first.",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-39",
          "content": "Any signs of tension in a relationship indicate the relationship has gone bad; therefore, I should cut it off.",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-40",
          "content": "If I don’t perform at the highest level, I will fail.",
          "type": "single",
          "required": true,
          "sortOrder": 39,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-41",
          "content": "Making dealines, complying with demands, and conforming are direct blows to my pride and self-sufficiency.",
          "type": "single",
          "required": true,
          "sortOrder": 40,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-42",
          "content": "I have been unfairly treated and am entitled to get my fair share by what ever means I can.",
          "type": "single",
          "required": true,
          "sortOrder": 41,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-43",
          "content": "If people get close to me, they will discover the \"real\" me and reject me.",
          "type": "single",
          "required": true,
          "sortOrder": 42,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-44",
          "content": "I am needy and weak.",
          "type": "single",
          "required": true,
          "sortOrder": 43,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-45",
          "content": "I am helpless when I’m left on my own.",
          "type": "single",
          "required": true,
          "sortOrder": 44,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-46",
          "content": "Other people should satisfy my needs.",
          "type": "single",
          "required": true,
          "sortOrder": 45,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-47",
          "content": "If I follow the rules the way people expect, it will inhibit my freedom of action.",
          "type": "single",
          "required": true,
          "sortOrder": 46,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-48",
          "content": "People will take advantage of me if I give them the chance.",
          "type": "single",
          "required": true,
          "sortOrder": 47,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-49",
          "content": "I have to be on guard at all times.",
          "type": "single",
          "required": true,
          "sortOrder": 48,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-50",
          "content": "My privacy is much more important to me than closeness to people.",
          "type": "single",
          "required": true,
          "sortOrder": 49,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-51",
          "content": "Rules are arbitrary and stifle me.",
          "type": "single",
          "required": true,
          "sortOrder": 50,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-52",
          "content": "It is awful if people ignore me.",
          "type": "single",
          "required": true,
          "sortOrder": 51,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-53",
          "content": "What other people think doesn’t matter to me.",
          "type": "single",
          "required": true,
          "sortOrder": 52,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-54",
          "content": "In order to be happy, I need other people to pay attention to me.",
          "type": "single",
          "required": true,
          "sortOrder": 53,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-55",
          "content": "If I entertain people, they will not notice my weaknesses.",
          "type": "single",
          "required": true,
          "sortOrder": 54,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-56",
          "content": "I need somebody around available at all times to help me to carry out what I need to do or in case something bad happens",
          "type": "single",
          "required": true,
          "sortOrder": 55,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-57",
          "content": "Any flaw or defect or performance may lead to a catastrophe.",
          "type": "single",
          "required": true,
          "sortOrder": 56,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-58",
          "content": "Since I am so talented, people should go out of their way to promote my career.",
          "type": "single",
          "required": true,
          "sortOrder": 57,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-59",
          "content": "If I don’t push other people, I will get pushed around.",
          "type": "single",
          "required": true,
          "sortOrder": 58,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-60",
          "content": "I don’t have to be bound by the rules that apply to other people.",
          "type": "single",
          "required": true,
          "sortOrder": 59,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-61",
          "content": "Force or cunning is the best way to get things done.",
          "type": "single",
          "required": true,
          "sortOrder": 60,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-62",
          "content": "I must maintain access to my supporter or helper at all times.",
          "type": "single",
          "required": true,
          "sortOrder": 61,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-63",
          "content": "I am basically alone -- unless I can attach myself to a stronger person.",
          "type": "single",
          "required": true,
          "sortOrder": 62,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-64",
          "content": "I cannot trust other people.",
          "type": "single",
          "required": true,
          "sortOrder": 63,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        },
        {
          "itemCode": "PBQ-65",
          "content": "I can’t cope as other people can.",
          "type": "single",
          "required": true,
          "sortOrder": 64,
          "responseSetKey": "pbq_belief_0_4",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "PBQ-01",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-02",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-03",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-04",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-05",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-06",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-07",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-08",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-09",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-10",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-11",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-12",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-13",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-14",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-15",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-16",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-17",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-18",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-19",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-20",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-21",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-22",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-23",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-24",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-25",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-26",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-27",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-28",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-29",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-30",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-31",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-32",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-33",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-34",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-35",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-36",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-37",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-38",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-39",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-40",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-41",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-42",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-43",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-44",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-45",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-46",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-47",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-48",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-49",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-50",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-51",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-52",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-53",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-54",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-55",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-56",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-57",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-58",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-59",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-60",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-61",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-62",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-63",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-64",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "PBQ-65",
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
            "key": "avoidant",
            "type": "dimension",
            "label": "回避型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-01",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-02",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-05",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-31",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-33",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-39",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-43",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "dependent",
            "type": "dimension",
            "label": "依赖型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-15",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-18",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-44",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-45",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-56",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-62",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-63",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "passive_aggressive",
            "type": "dimension",
            "label": "被动攻击型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-04",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-07",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-20",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-21",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-41",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-47",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-51",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "obsessive_compulsive",
            "type": "dimension",
            "label": "强迫型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-06",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-09",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-11",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-19",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-30",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-40",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-57",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "antisocial",
            "type": "dimension",
            "label": "反社会型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-23",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-32",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-35",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-38",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-42",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-59",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-61",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "narcissistic",
            "type": "dimension",
            "label": "自恋型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-10",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-16",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-26",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-27",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-46",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-58",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-60",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "histrionic",
            "type": "dimension",
            "label": "表演型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-08",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-22",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-34",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-37",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-52",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-54",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-55",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "schizoid",
            "type": "dimension",
            "label": "分裂样信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-12",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-25",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-28",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-29",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-36",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-50",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-53",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "paranoid",
            "type": "dimension",
            "label": "偏执型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-03",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-13",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-14",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-17",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-24",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-48",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-49",
                  "weight": 1
                }
              ],
              "aggregation": "sum"
            }
          },
          {
            "key": "borderline",
            "type": "dimension",
            "label": "边缘型信念",
            "description": "相关题作答直接求和（无反向题，0–4信念强度）；必须完整作答。范围0–28；与该量表同名人格风格有关的信念强度，不构成人格诊断。",
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
                  "itemCode": "PBQ-31",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-44",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-45",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-49",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-56",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-64",
                  "weight": 1
                },
                {
                  "itemCode": "PBQ-65",
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
          "avoidant",
          "dependent",
          "passive_aggressive",
          "obsessive_compulsive",
          "antisocial",
          "narcissistic",
          "histrionic",
          "schizoid",
          "paranoid",
          "borderline"
        ],
        "scoreOrder": [
          "avoidant",
          "dependent",
          "passive_aggressive",
          "obsessive_compulsive",
          "antisocial",
          "narcissistic",
          "histrionic",
          "schizoid",
          "paranoid",
          "borderline"
        ],
        "interpretations": [
          {
            "scoreKey": "avoidant",
            "headline": "“暴露即危险”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念关注被批评、被拒绝或暴露不足是否难以承受。它们更像长期形成的自我保护规则；得分高不等于你有回避型人格，也不定义你的社交能力。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次因为怕被否定而推掉的事情是什么？"
              },
              {
                "category": "strategy",
                "text": "选一个低风险的“小暴露”：在一件事上说出自己的真实想法，然后记录实际结果。"
              }
            ]
          },
          {
            "scoreKey": "dependent",
            "headline": "“独自撑不住”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念关注是否只有依靠更强的人才能应对生活。需要支持是人之常情；把支持当成唯一支柱才容易失衡。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "过去一个月里，哪些事其实是你独立完成的？"
              },
              {
                "category": "strategy",
                "text": "为一件小事先试自己的方案，再征求意见，比较两者差异。"
              }
            ]
          },
          {
            "scoreKey": "passive_aggressive",
            "headline": "“顺从即被压制”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念关注权威、规则与要求是否像对个人自由的侵犯。对不合理要求有抵触是正常的；留意的是“表面答应、背后较劲”的循环。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "你上一次“表面同意、心里不服”是什么情形？"
              },
              {
                "category": "strategy",
                "text": "试着把不满翻译成一句直接而尊重的话，说给当事人听。"
              }
            ]
          },
          {
            "scoreKey": "obsessive_compulsive",
            "headline": "“不完美就崩塌”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念关注错误、细节和最高标准是否被看作不可妥协。高标准本身有价值；当“必须完美”盖过“可以完成”时就容易耗竭。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "哪件被你反复修改的事，其实第一次版本已经够用？"
              },
              {
                "category": "strategy",
                "text": "选一件任务刻意做到“足够好”就停，记录结果是否真的变糟。"
              }
            ]
          },
          {
            "scoreKey": "antisocial",
            "headline": "“强者为王”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念把人际看作丛林、把手段看作正当。它们与冲动和越轨行为的研究相关联；信念强不等于行为会越界，但值得自我觉察。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "“规则都是给别人的”这个想法，最近一次在你心里出现是什么时候？"
              },
              {
                "category": "strategy",
                "text": "复盘一次“走捷径”的冲动：它带来了什么、又让你付出了什么。"
              }
            ]
          },
          {
            "scoreKey": "narcissistic",
            "headline": "“我应得特殊对待”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念关注特殊性与应得感。自信是资产；当它需要通过压过别人来确认时，关系容易紧张。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次感到“没被特别对待”的愤怒，背后期待的是什么？"
              },
              {
                "category": "strategy",
                "text": "做一件不署名的好事，练习让价值感不依赖观众。"
              }
            ]
          },
          {
            "scoreKey": "histrionic",
            "headline": "“被忽视就糟糕”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念关注是否必须被关注、逗乐他人才有存在感。渴望联结是天性；把注意力当作唯一货币会让关系变得疲惫。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "安静独处的时刻，你通常感觉如何？"
              },
              {
                "category": "strategy",
                "text": "尝试一次“不表演”的相聚：只倾听、不接梗，观察关系是否依然稳固。"
              }
            ]
          },
          {
            "scoreKey": "schizoid",
            "headline": "“关系是负担”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念把亲密看作纠缠、把独处看作保护。喜欢独处没有问题；需要留意的是“想靠近时却无法靠近”的僵局。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "哪些场合你其实想要陪伴，却用了回避的方式应对？"
              },
              {
                "category": "strategy",
                "text": "安排一次短时、可控的社交（30分钟内），结束后记录感受。"
              }
            ]
          },
          {
            "scoreKey": "paranoid",
            "headline": "“背后有意图”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念关注他人是否暗藏动机、需要时时设防。警觉曾是有效的保护；但持续开启会很耗能，也容易误读善意。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "最近一次“觉得对方有别的意思”，事后看证据支持吗？"
              },
              {
                "category": "strategy",
                "text": "写下三个最近被你解读为“有意图”的举动，各自列一个替代解释。"
              }
            ]
          },
          {
            "scoreKey": "borderline",
            "headline": "“情绪会失控”",
            "source": {
              "type": "score_only"
            },
            "summary": "这组信念关注被抛弃的恐惧、情绪的失控感与自我的不稳定感。它们在研究中与边缘型人格风格相关；高分说明这些体验频繁，不等于诊断，也不代表无法改变——DBT 技能训练正是为此发展。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "情绪最猛烈的时刻，通常由什么事件触发？"
              },
              {
                "category": "strategy",
                "text": "为强烈的情绪准备一个“降温清单”（冷水、快走、给信任的人发消息），写在手机里备用；若困扰持续，建议寻求专业支持。"
              }
            ]
          }
        ],
        "limitations": [
          "十个量表是“信念维度”分，不是人格障碍诊断，也不能用于人格评判或标签。",
          "原版为成人精神科门诊设计；对非临床人群效度证据较弱；不构成儿童青少年常模。",
          "官方计分定义Z分数（683门诊样本常模）；本实现只提供原始分，不提供常模、百分位或界值。",
          "官方计分不定义总分；各量表不可相加。",
          "各分数必须完整作答是产品保守约定；缺答不会算零。",
          "题本转录自 Beck Institute 公开下载资料（扫描件，第56题尾部印刷退化按正式发表文本录入），权利状态未确认。"
        ],
        "disclaimer": "仅供研究情境使用，不用于诊断、人格评判、高风险决策或替代专业帮助。"
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
            "itemCode": "PBQ-01",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-02",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-03",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-04",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-05",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-06",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-07",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-08",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-09",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-10",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-11",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-12",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-13",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-14",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-15",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-16",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-17",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-18",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-19",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-20",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-21",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-22",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-23",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-24",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-25",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-26",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-27",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-28",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-29",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-30",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-31",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-32",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-33",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-34",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-35",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-36",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-37",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-38",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-39",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-40",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-41",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-42",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-43",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-44",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-45",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-46",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-47",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-48",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-49",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-50",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-51",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-52",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-53",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-54",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-55",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-56",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-57",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-58",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-59",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-60",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-61",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-62",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-63",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-64",
            "responseValue": "0"
          },
          {
            "itemCode": "PBQ-65",
            "responseValue": "0"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "avoidant": 0,
            "dependent": 0,
            "passive_aggressive": 0,
            "obsessive_compulsive": 0,
            "antisocial": 0,
            "narcissistic": 0,
            "histrionic": 0,
            "schizoid": 0,
            "paranoid": 0,
            "borderline": 0
          },
          "totalScoreKeys": [
            "avoidant",
            "dependent",
            "passive_aggressive",
            "obsessive_compulsive",
            "antisocial",
            "narcissistic",
            "histrionic",
            "schizoid",
            "paranoid",
            "borderline"
          ]
        }
      },
      {
        "name": "all-keyed-max",
        "answers": [
          {
            "itemCode": "PBQ-01",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-02",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-03",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-04",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-05",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-06",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-07",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-08",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-09",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-10",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-11",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-12",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-13",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-14",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-15",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-16",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-17",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-18",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-19",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-20",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-21",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-22",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-23",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-24",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-25",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-26",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-27",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-28",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-29",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-30",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-31",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-32",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-33",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-34",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-35",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-36",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-37",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-38",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-39",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-40",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-41",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-42",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-43",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-44",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-45",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-46",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-47",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-48",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-49",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-50",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-51",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-52",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-53",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-54",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-55",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-56",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-57",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-58",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-59",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-60",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-61",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-62",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-63",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-64",
            "responseValue": "4"
          },
          {
            "itemCode": "PBQ-65",
            "responseValue": "4"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "avoidant": 28,
            "dependent": 28,
            "passive_aggressive": 28,
            "obsessive_compulsive": 28,
            "antisocial": 28,
            "narcissistic": 28,
            "histrionic": 28,
            "schizoid": 28,
            "paranoid": 28,
            "borderline": 28
          },
          "totalScoreKeys": [
            "avoidant",
            "dependent",
            "passive_aggressive",
            "obsessive_compulsive",
            "antisocial",
            "narcissistic",
            "histrionic",
            "schizoid",
            "paranoid",
            "borderline"
          ]
        }
      },
      {
        "name": "sample-odd2-even3",
        "answers": [
          {
            "itemCode": "PBQ-01",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-02",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-03",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-04",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-05",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-06",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-07",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-08",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-09",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-10",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-11",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-12",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-13",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-14",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-15",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-16",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-17",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-18",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-19",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-20",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-21",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-22",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-23",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-24",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-25",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-26",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-27",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-28",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-29",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-30",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-31",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-32",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-33",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-34",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-35",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-36",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-37",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-38",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-39",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-40",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-41",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-42",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-43",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-44",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-45",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-46",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-47",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-48",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-49",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-50",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-51",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-52",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-53",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-54",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-55",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-56",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-57",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-58",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-59",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-60",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-61",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-62",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-63",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-64",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-65",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "avoidant": 15,
            "dependent": 18,
            "passive_aggressive": 16,
            "obsessive_compulsive": 17,
            "antisocial": 17,
            "narcissistic": 20,
            "histrionic": 19,
            "schizoid": 18,
            "paranoid": 17,
            "borderline": 17
          },
          "totalScoreKeys": [
            "avoidant",
            "dependent",
            "passive_aggressive",
            "obsessive_compulsive",
            "antisocial",
            "narcissistic",
            "histrionic",
            "schizoid",
            "paranoid",
            "borderline"
          ]
        }
      },
      {
        "name": "missing-borderline",
        "answers": [
          {
            "itemCode": "PBQ-01",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-02",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-03",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-04",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-05",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-06",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-07",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-08",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-09",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-10",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-11",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-12",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-13",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-14",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-15",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-16",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-17",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-18",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-19",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-20",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-21",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-22",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-23",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-24",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-25",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-26",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-27",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-28",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-29",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-30",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-31",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-32",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-33",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-34",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-35",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-36",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-37",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-38",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-39",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-40",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-41",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-42",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-43",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-45",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-46",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-47",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-48",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-49",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-50",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-51",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-52",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-53",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-54",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-55",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-56",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-57",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-58",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-59",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-60",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-61",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-62",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-63",
            "responseValue": "2"
          },
          {
            "itemCode": "PBQ-64",
            "responseValue": "3"
          },
          {
            "itemCode": "PBQ-65",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "avoidant": 15,
            "dependent": null,
            "passive_aggressive": 16,
            "obsessive_compulsive": 17,
            "antisocial": 17,
            "narcissistic": 20,
            "histrionic": 19,
            "schizoid": 18,
            "paranoid": 17,
            "borderline": null
          },
          "totalScoreKeys": [
            "avoidant",
            "dependent",
            "passive_aggressive",
            "obsessive_compulsive",
            "antisocial",
            "narcissistic",
            "histrionic",
            "schizoid",
            "paranoid",
            "borderline"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
