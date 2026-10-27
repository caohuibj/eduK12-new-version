// CCNES-T native DRAFT: verbatim 12 situations x 6 responses from the author-distributed form.
import type { ScaleInstrumentSourceV1 } from '../../../onboarding/types'

export const SCALE_INSTRUMENT_SOURCE = {
  "schemaVersion": 1,
  "identity": {
    "instrumentKey": "ccnes_t",
    "instrumentVersion": "1.0.0"
  },
  "catalog": {
    "schemaVersion": 1,
    "catalogManifestVersion": 1,
    "catalogStatus": "CANDIDATE",
    "scientificMaturity": "PILOT",
    "identity": {
      "canonicalName": "Coping with Children's Negative Emotions Scale: Teacher Version",
      "abbreviation": "CCNES-T",
      "instrumentFamily": "Coping with Children's Negative Emotions Scale"
    },
    "construct": {
      "primaryDomain": "SOCIAL_EMOTIONAL",
      "secondaryDomains": [],
      "constructDefinition": "教师自评在学生表达消极情绪的假设情境中可能采取的六类回应，包括自身苦恼、惩罚、鼓励表达、情绪导向、问题导向及轻视回应。",
      "constructLevel": "SPECIFIC_CONSTRUCT",
      "constructOverlapTags": [
        "domain:sel",
        "license:author_contact_required",
        "license:redistribution_review_pending",
        "domain:sel_context",
        "population:teachers",
        "response:teacher_self",
        "use:reflection",
        "use:research",
        "license:noncommercial",
        "language_validation:english_original",
        "construct:sel_ccnes_t_distress_reactions",
        "construct:sel_ccnes_t_punitive_reactions",
        "construct:sel_ccnes_t_expressive_encouragement",
        "construct:sel_ccnes_t_emotion_focused",
        "construct:sel_ccnes_t_problem_focused",
        "construct:sel_ccnes_t_minimization",
        "teacher_self_report",
        "emotion_socialization",
        "teacher_response",
        "distress_reactions",
        "punitive_reactions",
        "expressive_encouragement",
        "emotion_focused",
        "problem_focused",
        "minimization"
      ]
    },
    "population": {
      "populationNotes": "教师对学前至小学低年级儿童情绪情境的自评；本轮交付作者官网公开英文原题的可执行草稿，中文译题未包含。",
      "respondentTypes": [
        "SELF"
      ],
      "developmentalEvidence": "UNKNOWN"
    },
    "administration": {
      "itemCount": 72,
      "estimatedMinutes": 15,
      "administrationModes": [
        "DIGITAL_SELF_ADMINISTERED",
        "DIGITAL_SUPERVISED",
        "PAPER"
      ],
      "timeFrame": "12 个假设情境，每个回应分别估计可能性；无指定回忆时段",
      "requiredTraining": false,
      "itemOrderLocked": true,
      "responseFormatLocked": true,
      "layoutConstraints": [
        "12 个情境各含 6 个独立 1–7 分可能性评定，共 72 次回答；不是情境单选，也无正确答案。",
        "每条回应都重复完整情境题干，避免脱离语境作答。",
        "选项沿用题本 1–7 可能性标尺；锚点文字按原文只在 1（Very unlikely）、4（Medium）、7（Very likely）。",
        "仅苦恼反应分量表的 2A、7C、8C、10A 四个回应反向（8 − 原值）。",
        "15 分钟是产品估计，不是作者承诺。"
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
          "notes": "结合具体情境与条件进行教育性反思，不作为教师考核。"
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
        "evidenceId": "fabes-ccnes-t-2000",
        "evidenceType": "CONTENT_VALIDITY",
        "population": "Teachers reporting responses to preschool and early elementary student distress scenarios",
        "locale": "en",
        "territory": "US",
        "studyDesign": "Authors’ teacher-version instrument and scoring instructions; six response types across twelve scenarios.",
        "rating": "UNKNOWN",
        "citation": "Fabes RA, Eisenberg N, Bernzweig J. The Coping with Children's Negative Emotions Scale: Teacher Version. 2000. Arizona State University.",
        "url": "https://ccnes.org/ccnes-teacher-responses",
        "notes": "此为原版资料而非完整心理测量验证研究；不能将 1990 家长版证据直接等同本版。第 4 页分量表说明沿用母版个别 parents 措辞，按教师版施测，不据此改动原文。"
      }
    ],
    "referenceApplicability": []
  },
  "usageRequirements": {
    "schemaVersion": 1,
    "policyVersion": "ccnes-t-educational-research",
    "requiredRightsActions": [
      "electronicAdministration",
      "scoring",
      "display"
    ],
    "notes": [
      "作者下载页规定仅用于教育和／或研究，并遵循伦理指导。",
      "不将教育/研究用途等同于不限范围商业、翻译及再分发授权。"
    ]
  },
  "applicability": {
    "schemaVersion": 1,
    "policyVersion": "ccnes-t-v1",
    "respondentTypes": [
      "SELF"
    ],
    "requiredContextKeys": []
  },
  "disclosure": {
    "schemaVersion": 1,
    "policyVersion": "ccnes-t-v1",
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
    "text": "In the following items, please indicate on a scale from 1 (very unlikely) to 7 (very likely) the likelihood that you would respond in the ways listed for each item. Please read each item carefully and respond as honestly and sincerely as you can. For each response, please circle a number from 1-7.",
    "language": "en",
    "version": "1.0.0",
    "source": "作者题本说明页（Teacher Attitude/Behavior Questionnaire，ccnes.org 公开下载）。"
  },
  "executable": {
    "releaseStatus": "DRAFT",
    "contentLocale": "en",
    "references": [],
    "definition": {
      "schemaVersion": 2,
      "respondentType": "participant_self_report",
      "source": {
        "title": "Coping with Children's Negative Emotions Scale: Teacher Version",
        "citation": "Fabes RA, Eisenberg N, Bernzweig J. The Coping with Children's Negative Emotions Scale: Teacher Version. 2000. Arizona State University. Available from authors at http://ccnes.org.",
        "url": "https://ccnes.org/ccnes-teacher-responses",
        "publicationYear": 2000
      },
      "license": {
        "status": "unknown",
        "redistribution": "restricted",
        "note": "作者下载页说明资料供教育和／或研究用途并要求遵循伦理指导；题本要求按指定格式引用（Fabes, Eisenberg, & Bernzweig, 2000，Available from authors at http://ccnes.org）。教育/研究用途不等于不限范围的商业、翻译或再分发授权；超出该范围前须向作者确认。本记录按非商业研究草稿登记，未获得作者正式授权确认。"
      },
      "display": {
        "randomizeItems": false
      },
      "responseSets": [
        {
          "key": "ccnes_t_likelihood_1_7",
          "options": [
            {
              "value": "1",
              "label": "Very unlikely",
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
              "label": "Medium",
              "score": 4
            },
            {
              "value": "5",
              "label": "5",
              "score": 5
            },
            {
              "value": "6",
              "label": "6",
              "score": 6
            },
            {
              "value": "7",
              "label": "Very likely",
              "score": 7
            }
          ]
        }
      ],
      "items": [
        {
          "itemCode": "CCNES-1A",
          "content": "Situation 1: If my student becomes angry because he/she is unable to participate in a classroom social activity (such as a field trip), I would: (a) send my student to a different room to cool off",
          "type": "single",
          "required": true,
          "sortOrder": 0,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-1B",
          "content": "Situation 1: If my student becomes angry because he/she is unable to participate in a classroom social activity (such as a field trip), I would: (b) get angry at my student",
          "type": "single",
          "required": true,
          "sortOrder": 1,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-1C",
          "content": "Situation 1: If my student becomes angry because he/she is unable to participate in a classroom social activity (such as a field trip), I would: (c) help my student think about other ways that he/she can participate (e.g. participate in a different activity)",
          "type": "single",
          "required": true,
          "sortOrder": 2,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-1D",
          "content": "Situation 1: If my student becomes angry because he/she is unable to participate in a classroom social activity (such as a field trip), I would: (d) tell my student not to make a big deal out of missing the activity",
          "type": "single",
          "required": true,
          "sortOrder": 3,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-1E",
          "content": "Situation 1: If my student becomes angry because he/she is unable to participate in a classroom social activity (such as a field trip), I would: (e) encourage my student to express his/her feelings of anger and frustration",
          "type": "single",
          "required": true,
          "sortOrder": 4,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-1F",
          "content": "Situation 1: If my student becomes angry because he/she is unable to participate in a classroom social activity (such as a field trip), I would: (f) soothe my student and do something fun with him/her to make him/her feel better about missing the activity",
          "type": "single",
          "required": true,
          "sortOrder": 5,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-2A",
          "content": "Situation 2: If my student accidentally damages some classroom materials, and then gets upset and cries, I would: (a) remain calm and not let myself get anxious",
          "type": "single",
          "required": true,
          "sortOrder": 6,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-2B",
          "content": "Situation 2: If my student accidentally damages some classroom materials, and then gets upset and cries, I would: (b) comfort my student and try to get him/her to forget about the accident",
          "type": "single",
          "required": true,
          "sortOrder": 7,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-2C",
          "content": "Situation 2: If my student accidentally damages some classroom materials, and then gets upset and cries, I would: (c) tell my student that he/she is over-reacting",
          "type": "single",
          "required": true,
          "sortOrder": 8,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-2D",
          "content": "Situation 2: If my student accidentally damages some classroom materials, and then gets upset and cries, I would: (d) help my student figure out how to fix the materials",
          "type": "single",
          "required": true,
          "sortOrder": 9,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-2E",
          "content": "Situation 2: If my student accidentally damages some classroom materials, and then gets upset and cries, I would: (e) tell my student it's ok to cry",
          "type": "single",
          "required": true,
          "sortOrder": 10,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-2F",
          "content": "Situation 2: If my student accidentally damages some classroom materials, and then gets upset and cries, I would: (f) tell my student to stop crying or he/she won't be allowed to play on the equipment anytime soon",
          "type": "single",
          "required": true,
          "sortOrder": 11,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-3A",
          "content": "Situation 3: If my student loses some prized possession and reacts with tears, I would: (a) get upset with him/her for being so careless and then crying about it",
          "type": "single",
          "required": true,
          "sortOrder": 12,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-3B",
          "content": "Situation 3: If my student loses some prized possession and reacts with tears, I would: (b) tell my student that he/she is over-reacting",
          "type": "single",
          "required": true,
          "sortOrder": 13,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-3C",
          "content": "Situation 3: If my student loses some prized possession and reacts with tears, I would: (c) help my student think of places he/she hasn't looked yet",
          "type": "single",
          "required": true,
          "sortOrder": 14,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-3D",
          "content": "Situation 3: If my student loses some prized possession and reacts with tears, I would: (d) distract my student by talking about happy things",
          "type": "single",
          "required": true,
          "sortOrder": 15,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-3E",
          "content": "Situation 3: If my student loses some prized possession and reacts with tears, I would: (e) tell him/her it's ok to cry when you feel unhappy",
          "type": "single",
          "required": true,
          "sortOrder": 16,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-3F",
          "content": "Situation 3: If my student loses some prized possession and reacts with tears, I would: (f) tell him/her that's what happens when you're not careful",
          "type": "single",
          "required": true,
          "sortOrder": 17,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-4A",
          "content": "Situation 4: If my student is afraid of injections and becomes quite shaky and teary while waiting for his/her turn to get a shot at the nurses office, I would: (a) tell him/her to shape up or he/she won't be allowed to do something he/she likes to do (e.g., have recess)",
          "type": "single",
          "required": true,
          "sortOrder": 18,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-4B",
          "content": "Situation 4: If my student is afraid of injections and becomes quite shaky and teary while waiting for his/her turn to get a shot at the nurses office, I would: (b) encourage my student to talk about his/her fears",
          "type": "single",
          "required": true,
          "sortOrder": 19,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-4C",
          "content": "Situation 4: If my student is afraid of injections and becomes quite shaky and teary while waiting for his/her turn to get a shot at the nurses office, I would: (c) tell my student not to make big deal of the shot",
          "type": "single",
          "required": true,
          "sortOrder": 20,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-4D",
          "content": "Situation 4: If my student is afraid of injections and becomes quite shaky and teary while waiting for his/her turn to get a shot at the nurses office, I would: (d) tell him/her not to embarrass us by crying",
          "type": "single",
          "required": true,
          "sortOrder": 21,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-4E",
          "content": "Situation 4: If my student is afraid of injections and becomes quite shaky and teary while waiting for his/her turn to get a shot at the nurses office, I would: (e) comfort him/her before and after the shot",
          "type": "single",
          "required": true,
          "sortOrder": 22,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-4F",
          "content": "Situation 4: If my student is afraid of injections and becomes quite shaky and teary while waiting for his/her turn to get a shot at the nurses office, I would: (f) talk to my student about ways to make it hurt less (such as relaxing so it won't hurt or taking deep breaths).",
          "type": "single",
          "required": true,
          "sortOrder": 23,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-5A",
          "content": "Situation 5: If my student is doing some difficult work and becomes nervous and upset because I can't stay beside him/her, I would: (a) distract my student by talking about how easy it would be for him/her to do the work alone",
          "type": "single",
          "required": true,
          "sortOrder": 24,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-5B",
          "content": "Situation 5: If my student is doing some difficult work and becomes nervous and upset because I can't stay beside him/her, I would: (b) help my student think of things that he/she could do so that working independently me wasn't intimidating (e.g., talk him/herself through the problems)",
          "type": "single",
          "required": true,
          "sortOrder": 25,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-5C",
          "content": "Situation 5: If my student is doing some difficult work and becomes nervous and upset because I can't stay beside him/her, I would: (c) tell my student to quit over-reacting and being childish",
          "type": "single",
          "required": true,
          "sortOrder": 26,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-5D",
          "content": "Situation 5: If my student is doing some difficult work and becomes nervous and upset because I can't stay beside him/her, I would: (d) tell the student that if he/she doesn't stop that he/she won't be allowed to have free time that day",
          "type": "single",
          "required": true,
          "sortOrder": 27,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-5E",
          "content": "Situation 5: If my student is doing some difficult work and becomes nervous and upset because I can't stay beside him/her, I would: (e) feel upset and uncomfortable because of my student's reactions",
          "type": "single",
          "required": true,
          "sortOrder": 28,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-5F",
          "content": "Situation 5: If my student is doing some difficult work and becomes nervous and upset because I can't stay beside him/her, I would: (f) encourage my student to talk about his/her nervous feelings",
          "type": "single",
          "required": true,
          "sortOrder": 29,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-6A",
          "content": "Situation 6: If my student is participating in some group activity with his/her friends and proceeds to make a mistake and then looks embarrassed and on the verge of tears, I would: (a) comfort my student and try to make him/her feel better",
          "type": "single",
          "required": true,
          "sortOrder": 30,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-6B",
          "content": "Situation 6: If my student is participating in some group activity with his/her friends and proceeds to make a mistake and then looks embarrassed and on the verge of tears, I would: (b) tell my student that he/she is over-reacting",
          "type": "single",
          "required": true,
          "sortOrder": 31,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-6C",
          "content": "Situation 6: If my student is participating in some group activity with his/her friends and proceeds to make a mistake and then looks embarrassed and on the verge of tears, I would: (c) feel uncomfortable and embarrassed myself",
          "type": "single",
          "required": true,
          "sortOrder": 32,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-6D",
          "content": "Situation 6: If my student is participating in some group activity with his/her friends and proceeds to make a mistake and then looks embarrassed and on the verge of tears, I would: (d) tell my student to straighten up or he/she will have to leave the group",
          "type": "single",
          "required": true,
          "sortOrder": 33,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-6E",
          "content": "Situation 6: If my student is participating in some group activity with his/her friends and proceeds to make a mistake and then looks embarrassed and on the verge of tears, I would: (e) encourage my student to talk about his/her feelings of embarrassment",
          "type": "single",
          "required": true,
          "sortOrder": 34,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-6F",
          "content": "Situation 6: If my student is participating in some group activity with his/her friends and proceeds to make a mistake and then looks embarrassed and on the verge of tears, I would: (f) tell my student that I'll help him/her practice so that he/she can do better next time",
          "type": "single",
          "required": true,
          "sortOrder": 35,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-7A",
          "content": "Situation 7: If my student is about to appear in a recital or sports activity and becomes visibly nervous about people watching him/her, I would: (a) help my student think of things that he/she could do to get ready for his/her turn (e.g., to do some warm-ups and not to look at the audience)",
          "type": "single",
          "required": true,
          "sortOrder": 36,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-7B",
          "content": "Situation 7: If my student is about to appear in a recital or sports activity and becomes visibly nervous about people watching him/her, I would: (b) suggest that my student think about something relaxing so that his/her nervousness will go away",
          "type": "single",
          "required": true,
          "sortOrder": 37,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-7C",
          "content": "Situation 7: If my student is about to appear in a recital or sports activity and becomes visibly nervous about people watching him/her, I would: (c) remain calm and not get nervous myself",
          "type": "single",
          "required": true,
          "sortOrder": 38,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-7D",
          "content": "Situation 7: If my student is about to appear in a recital or sports activity and becomes visibly nervous about people watching him/her, I would: (d) tell my student that he/she is being childish about it",
          "type": "single",
          "required": true,
          "sortOrder": 39,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-7E",
          "content": "Situation 7: If my student is about to appear in a recital or sports activity and becomes visibly nervous about people watching him/her, I would: (e) tell my student that if he/she doesn't calm down, he/she will not be able to participate",
          "type": "single",
          "required": true,
          "sortOrder": 40,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-7F",
          "content": "Situation 7: If my student is about to appear in a recital or sports activity and becomes visibly nervous about people watching him/her, I would: (f) encourage my student to talk about his/her nervous feelings",
          "type": "single",
          "required": true,
          "sortOrder": 41,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-8A",
          "content": "Situation 8: If my student receives an undesirable gift or card from a friend and looks obviously disappointed, even annoyed, after opening it in the presence of the friend, I would: (a) encourage my student to express his/her disappointed feelings",
          "type": "single",
          "required": true,
          "sortOrder": 42,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-8B",
          "content": "Situation 8: If my student receives an undesirable gift or card from a friend and looks obviously disappointed, even annoyed, after opening it in the presence of the friend, I would: (b) tell my student that the present can be exchanged for something the student wants",
          "type": "single",
          "required": true,
          "sortOrder": 43,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-8C",
          "content": "Situation 8: If my student receives an undesirable gift or card from a friend and looks obviously disappointed, even annoyed, after opening it in the presence of the friend, I would: (c) NOT be annoyed with my student for being rude",
          "type": "single",
          "required": true,
          "sortOrder": 44,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-8D",
          "content": "Situation 8: If my student receives an undesirable gift or card from a friend and looks obviously disappointed, even annoyed, after opening it in the presence of the friend, I would: (d) tell my student that he/she is over-reacting",
          "type": "single",
          "required": true,
          "sortOrder": 45,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-8E",
          "content": "Situation 8: If my student receives an undesirable gift or card from a friend and looks obviously disappointed, even annoyed, after opening it in the presence of the friend, I would: (e) scold my student for being insensitive to the friend's feelings",
          "type": "single",
          "required": true,
          "sortOrder": 46,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-8F",
          "content": "Situation 8: If my student receives an undesirable gift or card from a friend and looks obviously disappointed, even annoyed, after opening it in the presence of the friend, I would: (f) try to get my student to feel better by doing something fun",
          "type": "single",
          "required": true,
          "sortOrder": 47,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-9A",
          "content": "Situation 9: If my student is panicy and can't concentrate after talking with another student about something that was frightening to him/her, I would: (a) encourage my student to talk about what was frightening",
          "type": "single",
          "required": true,
          "sortOrder": 48,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-9B",
          "content": "Situation 9: If my student is panicy and can't concentrate after talking with another student about something that was frightening to him/her, I would: (b) get upset with him/her for being silly",
          "type": "single",
          "required": true,
          "sortOrder": 49,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-9C",
          "content": "Situation 9: If my student is panicy and can't concentrate after talking with another student about something that was frightening to him/her, I would: (c) tell my student that he/she is over-reacting",
          "type": "single",
          "required": true,
          "sortOrder": 50,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-9D",
          "content": "Situation 9: If my student is panicy and can't concentrate after talking with another student about something that was frightening to him/her, I would: (d) help my student think of something to do so that he/she can get to work (e.g., not think about it, focus on working)",
          "type": "single",
          "required": true,
          "sortOrder": 51,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-9E",
          "content": "Situation 9: If my student is panicy and can't concentrate after talking with another student about something that was frightening to him/her, I would: (e) tell him/her to go to bed or he/she won't be allowed to talk with that friend in school",
          "type": "single",
          "required": true,
          "sortOrder": 52,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-9F",
          "content": "Situation 9: If my student is panicy and can't concentrate after talking with another student about something that was frightening to him/her, I would: (f) do something fun with my student to help him/her forget about what scared him/her",
          "type": "single",
          "required": true,
          "sortOrder": 53,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-10A",
          "content": "Situation 10: If my student is at recess and appears on the verge of tears because the other children are mean to him/her and won't let him/her play with them, I would: (a) NOT get upset myself",
          "type": "single",
          "required": true,
          "sortOrder": 54,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-10B",
          "content": "Situation 10: If my student is at recess and appears on the verge of tears because the other children are mean to him/her and won't let him/her play with them, I would: (b) tell my student that if he/she starts crying then he/she will have to sit out.",
          "type": "single",
          "required": true,
          "sortOrder": 55,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-10C",
          "content": "Situation 10: If my student is at recess and appears on the verge of tears because the other children are mean to him/her and won't let him/her play with them, I would: (c) tell my student it's ok to cry when he/she feels bad",
          "type": "single",
          "required": true,
          "sortOrder": 56,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-10D",
          "content": "Situation 10: If my student is at recess and appears on the verge of tears because the other children are mean to him/her and won't let him/her play with them, I would: (d) comfort my student and try to get him/her to think about something happy",
          "type": "single",
          "required": true,
          "sortOrder": 57,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-10E",
          "content": "Situation 10: If my student is at recess and appears on the verge of tears because the other children are mean to him/her and won't let him/her play with them, I would: (e) help my student think of something else to do",
          "type": "single",
          "required": true,
          "sortOrder": 58,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-10F",
          "content": "Situation 10: If my student is at recess and appears on the verge of tears because the other children are mean to him/her and won't let him/her play with them, I would: (f) tell my student that he/she will feel better soon",
          "type": "single",
          "required": true,
          "sortOrder": 59,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-11A",
          "content": "Situation 11: If my student is playing with other children and one of them calls him/her names, and my student then begins to tremble and become tearful, I would: (a) tell my student not to make a big deal out of it",
          "type": "single",
          "required": true,
          "sortOrder": 60,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-11B",
          "content": "Situation 11: If my student is playing with other children and one of them calls him/her names, and my student then begins to tremble and become tearful, I would: (b) feel upset myself",
          "type": "single",
          "required": true,
          "sortOrder": 61,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-11C",
          "content": "Situation 11: If my student is playing with other children and one of them calls him/her names, and my student then begins to tremble and become tearful, I would: (c) tell my student to behave or he/she will have to leave the game",
          "type": "single",
          "required": true,
          "sortOrder": 62,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-11D",
          "content": "Situation 11: If my student is playing with other children and one of them calls him/her names, and my student then begins to tremble and become tearful, I would: (d) help my student think of constructive things to do when other children tease him/her (e.g., find other things to do)",
          "type": "single",
          "required": true,
          "sortOrder": 63,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-11E",
          "content": "Situation 11: If my student is playing with other children and one of them calls him/her names, and my student then begins to tremble and become tearful, I would: (e) comfort him/her and play a game to take his/her mind off the upsetting event",
          "type": "single",
          "required": true,
          "sortOrder": 64,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-11F",
          "content": "Situation 11: If my student is playing with other children and one of them calls him/her names, and my student then begins to tremble and become tearful, I would: (f) encourage him/her to talk about how it hurts to be teased",
          "type": "single",
          "required": true,
          "sortOrder": 65,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-12A",
          "content": "Situation 12: If my student is shy and scared around strangers and consistently becomes quiet and withdrawn whenever visitors come to the classroom, I would: (a) help my student think of things to do that would make meeting new people less intimidating.",
          "type": "single",
          "required": true,
          "sortOrder": 66,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-12B",
          "content": "Situation 12: If my student is shy and scared around strangers and consistently becomes quiet and withdrawn whenever visitors come to the classroom, I would: (b) tell my student that it is OK to feel nervous",
          "type": "single",
          "required": true,
          "sortOrder": 67,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-12C",
          "content": "Situation 12: If my student is shy and scared around strangers and consistently becomes quiet and withdrawn whenever visitors come to the classroom, I would: (c) try to make my student happy by talking about how much fun it is to meet new people",
          "type": "single",
          "required": true,
          "sortOrder": 68,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-12D",
          "content": "Situation 12: If my student is shy and scared around strangers and consistently becomes quiet and withdrawn whenever visitors come to the classroom, I would: (d) feel upset and uncomfortable because of my student's reactions",
          "type": "single",
          "required": true,
          "sortOrder": 69,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-12E",
          "content": "Situation 12: If my student is shy and scared around strangers and consistently becomes quiet and withdrawn whenever visitors come to the classroom, I would: (e) tell my student that he/she must interact with visitors appropriately",
          "type": "single",
          "required": true,
          "sortOrder": 70,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        },
        {
          "itemCode": "CCNES-12F",
          "content": "Situation 12: If my student is shy and scared around strangers and consistently becomes quiet and withdrawn whenever visitors come to the classroom, I would: (f) tell my student that he/she is being childish or immature",
          "type": "single",
          "required": true,
          "sortOrder": 71,
          "responseSetKey": "ccnes_t_likelihood_1_7",
          "randomizeOptions": false
        }
      ],
      "scoring": {
        "scoringVersion": "1.0.0",
        "itemRules": [
          {
            "itemCode": "CCNES-1A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-1B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-1C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-1D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-1E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-1F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-2A",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CCNES-2B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-2C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-2D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-2E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-2F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-3A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-3B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-3C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-3D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-3E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-3F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-4A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-4B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-4C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-4D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-4E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-4F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-5A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-5B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-5C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-5D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-5E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-5F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-6A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-6B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-6C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-6D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-6E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-6F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-7A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-7B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-7C",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CCNES-7D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-7E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-7F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-8A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-8B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-8C",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CCNES-8D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-8E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-8F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-9A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-9B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-9C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-9D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-9E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-9F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-10A",
            "transform": {
              "type": "reverse"
            }
          },
          {
            "itemCode": "CCNES-10B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-10C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-10D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-10E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-10F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-11A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-11B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-11C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-11D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-11E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-11F",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-12A",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-12B",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-12C",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-12D",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-12E",
            "transform": {
              "type": "identity"
            }
          },
          {
            "itemCode": "CCNES-12F",
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
            "key": "distress_reactions",
            "type": "dimension",
            "label": "苦恼反应",
            "description": "该类 12 个回应按作者规则统一方向后的平均分；范围 1–7。",
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
                  "itemCode": "CCNES-1B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-2A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-3A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-4D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-5E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-6C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-7C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-8C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-9B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-10A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-11B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-12D",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "punitive_reactions",
            "type": "dimension",
            "label": "惩罚反应",
            "description": "该类 12 个回应按作者规则统一方向后的平均分；范围 1–7。",
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
                  "itemCode": "CCNES-1A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-2F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-3F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-4A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-5D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-6D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-7E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-8E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-9E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-10B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-11C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-12E",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "expressive_encouragement",
            "type": "dimension",
            "label": "鼓励表达",
            "description": "该类 12 个回应按作者规则统一方向后的平均分；范围 1–7。",
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
                  "itemCode": "CCNES-1E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-2E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-3E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-4B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-5F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-6E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-7F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-8A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-9A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-10C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-11F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-12B",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "emotion_focused",
            "type": "dimension",
            "label": "关注情绪的回应",
            "description": "该类 12 个回应按作者规则统一方向后的平均分；范围 1–7。",
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
                  "itemCode": "CCNES-1F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-2B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-3D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-4E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-5A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-6A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-7B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-8F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-9F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-10D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-11E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-12C",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "problem_focused",
            "type": "dimension",
            "label": "关注问题的回应",
            "description": "该类 12 个回应按作者规则统一方向后的平均分；范围 1–7。",
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
                  "itemCode": "CCNES-1C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-2D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-3C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-4F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-5B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-6F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-7A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-8B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-9D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-10E",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-11D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-12A",
                  "weight": 1
                }
              ],
              "aggregation": "mean"
            }
          },
          {
            "key": "minimization",
            "type": "dimension",
            "label": "轻视反应",
            "description": "该类 12 个回应按作者规则统一方向后的平均分；范围 1–7。",
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
                  "itemCode": "CCNES-1D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-2C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-3B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-4C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-5C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-6B",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-7D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-8D",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-9C",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-10F",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-11A",
                  "weight": 1
                },
                {
                  "itemCode": "CCNES-12F",
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
          "distress_reactions",
          "punitive_reactions",
          "expressive_encouragement",
          "emotion_focused",
          "problem_focused",
          "minimization"
        ],
        "scoreOrder": [
          "distress_reactions",
          "punitive_reactions",
          "expressive_encouragement",
          "emotion_focused",
          "problem_focused",
          "minimization"
        ],
        "interpretations": [
          {
            "scoreKey": "distress_reactions",
            "headline": "你自己也会被搅进去",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回应反映学生表达负面情绪时，你自己会不会跟着心烦、不安或想离开。分数是这组回应的平均；越高表示这种反应越常见。先照顾好自己的状态，才更有空间接住学生。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "下次被学生的情绪搅动时，先给自己几秒停顿，注意到自己的感受再回应。"
              }
            ]
          },
          {
            "scoreKey": "punitive_reactions",
            "headline": "用惩罚停下情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回应看的是你会不会用警告、取消活动等方式让学生停止表达情绪。这类做法常常能快速让场面停下来，但学生同时学到的是：这些情绪不受欢迎。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "回想一次你想制止学生哭泣或生气的时刻：如果不用惩罚，还能怎么说？"
              }
            ]
          },
          {
            "scoreKey": "expressive_encouragement",
            "headline": "允许情绪表达",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回应反映你多鼓励学生说出、承认自己的感受，或让学生知道难受是可以的。分数越高表示越常这样做。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "本周找一次机会，明确告诉学生：觉得难过或生气是可以的。"
              }
            ]
          },
          {
            "scoreKey": "emotion_focused",
            "headline": "先安抚情绪",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回应看的是你会不会安慰学生、做点让学生好受一些的事，先处理心情再处理事情。分数越高表示越常用这类支持。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "下次学生难过时，先安抚再谈事情，看看有什么不同。"
              }
            ]
          },
          {
            "scoreKey": "problem_focused",
            "headline": "一起解决问题",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回应反映你会不会帮学生想办法处理引起难受的事情本身。分数越高表示越常用这类做法。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "下次学生遇到困难，试着问一句：我们一起想想有什么办法？"
              }
            ]
          },
          {
            "scoreKey": "minimization",
            "headline": "把事情说小",
            "source": {
              "type": "score_only"
            },
            "summary": "这组回应看的是你会不会淡化事情、让学生别反应过度。这可能让学生觉得自己的感受不重要。分数越高表示越常用。",
            "bands": [],
            "guidance": [
              {
                "category": "reflection",
                "text": "当想说“这没什么”时，先问一句：你现在的感觉是什么？"
              }
            ]
          }
        ],
        "limitations": [
          "这是教师自报的回应倾向，反映一次作答，不等于课堂上的实际行为。",
          "六个分量表描述不同回应方式；分数不构成对教师好差的评价，不用于考核或排名。",
          "题文为作者官网公开英文原题；本版本未包含中文译题，中文施测前须先完成翻译与验证。",
          "原工具第 4 页分量表说明沿用母版个别 parents 措辞；本记录按教师版施测，不据此改动原文。",
          "没有适用于你的常模或诊断阈值。"
        ],
        "disclaimer": "这份报告用于教学反思，不用于评价、排名或考核教师。"
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
            "itemCode": "CCNES-1A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-1B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-1C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-1D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-1E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-1F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-2A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-2B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-2C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-2D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-2E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-2F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-3A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-3B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-3C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-3D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-3E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-3F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-4A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-4B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-4C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-4D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-4E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-4F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-5A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-5B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-5C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-5D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-5E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-5F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-6A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-6B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-6C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-6D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-6E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-6F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-7A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-7B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-7C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-7D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-7E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-7F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-8A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-8B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-8C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-8D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-8E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-8F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-9A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-9B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-9C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-9D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-9E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-9F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-10A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-10B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-10C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-10D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-10E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-10F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-11A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-11B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-11C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-11D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-11E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-11F",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-12A",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-12B",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-12C",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-12D",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-12E",
            "responseValue": "1"
          },
          {
            "itemCode": "CCNES-12F",
            "responseValue": "1"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "distress_reactions": 3,
            "punitive_reactions": 1,
            "expressive_encouragement": 1,
            "emotion_focused": 1,
            "problem_focused": 1,
            "minimization": 1
          },
          "totalScoreKeys": [
            "distress_reactions",
            "punitive_reactions",
            "expressive_encouragement",
            "emotion_focused",
            "problem_focused",
            "minimization"
          ]
        }
      },
      {
        "name": "maximum-keyed",
        "answers": [
          {
            "itemCode": "CCNES-1A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-1B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-1C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-1D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-1E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-1F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-2A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-2B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-2C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-2D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-2E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-2F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-3A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-3B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-3C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-3D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-3E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-3F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-4A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-4B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-4C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-4D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-4E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-4F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-5A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-5B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-5C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-5D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-5E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-5F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-6A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-6B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-6C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-6D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-6E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-6F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-7A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-7B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-7C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-7D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-7E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-7F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-8A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-8B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-8C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-8D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-8E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-8F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-9A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-9B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-9C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-9D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-9E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-9F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-10A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-10B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-10C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-10D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-10E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-10F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-11A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-11B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-11C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-11D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-11E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-11F",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-12A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-12B",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-12C",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-12D",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-12E",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-12F",
            "responseValue": "7"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "distress_reactions": 5,
            "punitive_reactions": 7,
            "expressive_encouragement": 7,
            "emotion_focused": 7,
            "problem_focused": 7,
            "minimization": 7
          },
          "totalScoreKeys": [
            "distress_reactions",
            "punitive_reactions",
            "expressive_encouragement",
            "emotion_focused",
            "problem_focused",
            "minimization"
          ]
        }
      },
      {
        "name": "sample-mixed",
        "answers": [
          {
            "itemCode": "CCNES-1A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-1B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-1C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-1D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-1E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-1F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-2A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-2B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-2C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-2D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-2E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-2F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-3A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-3B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-3C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-3D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-3E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-3F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-4A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-4B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-4C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-4D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-4E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-4F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-5A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-5B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-5C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-5D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-5E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-5F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-6A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-6B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-6C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-6D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-6E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-6F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-7A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-7B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-7C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-7D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-7E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-7F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-8A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-8B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-8C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-8D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-8E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-8F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-9A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-9B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-9C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-9D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-9E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-9F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-10A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-10B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-10C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-10D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-10E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-10F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-11A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-11B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-11C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-11D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-11E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-11F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-12A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-12B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-12C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-12D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-12E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-12F",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "interpretable",
          "scores": {
            "distress_reactions": 4.083333333333333,
            "punitive_reactions": 4.083333333333333,
            "expressive_encouragement": 4.083333333333333,
            "emotion_focused": 4.25,
            "problem_focused": 4.583333333333333,
            "minimization": 4.583333333333333
          },
          "totalScoreKeys": [
            "distress_reactions",
            "punitive_reactions",
            "expressive_encouragement",
            "emotion_focused",
            "problem_focused",
            "minimization"
          ]
        }
      },
      {
        "name": "missing-subscale-response",
        "answers": [
          {
            "itemCode": "CCNES-1A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-1B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-1C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-1D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-1E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-1F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-2A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-2B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-2C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-2D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-2E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-2F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-3A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-3B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-3C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-3D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-3E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-3F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-4A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-4B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-4C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-4D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-4E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-4F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-5A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-5C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-5D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-5E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-5F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-6A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-6B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-6C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-6D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-6E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-6F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-7A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-7B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-7C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-7D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-7E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-7F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-8A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-8B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-8C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-8D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-8E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-8F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-9A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-9B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-9C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-9D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-9E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-9F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-10A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-10B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-10C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-10D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-10E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-10F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-11A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-11B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-11C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-11D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-11E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-11F",
            "responseValue": "2"
          },
          {
            "itemCode": "CCNES-12A",
            "responseValue": "7"
          },
          {
            "itemCode": "CCNES-12B",
            "responseValue": "6"
          },
          {
            "itemCode": "CCNES-12C",
            "responseValue": "5"
          },
          {
            "itemCode": "CCNES-12D",
            "responseValue": "4"
          },
          {
            "itemCode": "CCNES-12E",
            "responseValue": "3"
          },
          {
            "itemCode": "CCNES-12F",
            "responseValue": "2"
          }
        ],
        "expected": {
          "quality": "invalid",
          "scores": {
            "distress_reactions": 4.083333333333333,
            "punitive_reactions": 4.083333333333333,
            "expressive_encouragement": 4.083333333333333,
            "emotion_focused": 4.25,
            "problem_focused": null,
            "minimization": 4.583333333333333
          },
          "totalScoreKeys": [
            "distress_reactions",
            "punitive_reactions",
            "expressive_encouragement",
            "emotion_focused",
            "problem_focused",
            "minimization"
          ]
        }
      }
    ]
  }
} satisfies ScaleInstrumentSourceV1
