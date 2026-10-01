import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  {
    "schemaVersion": 1,
    "presentationVersion": "1.1.0",
    "testType": "digitbackward",
    "engineVersion": "1.0.0",
    "scoringVersion": "1.0.0",
    "title": "数字倒背",
    "metrics": {
      "maxSpan": {
        "label": "最大倒背广度",
        "explanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "singleExplanation": "最长正确序列：本次任务中能够正确完成的最高序列长度。",
        "displayUnit": "位"
      },
      "totalCorrectTrials": {
        "label": "正确试次总数",
        "explanation": "正确试次数：本次正式测验中完整答对的试次数。",
        "singleExplanation": "正确试次数：本次正式测验中完整答对的试次数。"
      },
      "sequenceDistance": {
        "label": "平均序列距离",
        "explanation": "输入序列与正确倒序序列之间的平均距离，越小表示本次还原越接近目标。",
        "singleExplanation": "输入序列与正确倒序序列之间的平均距离，越小表示本次还原越接近目标。"
      },
      "medianResponseDurationMs": {
        "label": "中位作答时长",
        "explanation": "各次输入作答时长的中位数。",
        "singleExplanation": "各次输入作答时长的中位数。"
      },
      "completedLevelCount": {
        "label": "完成级数",
        "explanation": "本次完成的数字长度级数。",
        "singleExplanation": "本次完成的数字长度级数。"
      }
    },
    "hiddenMetrics": [],
    "suppressTips": false,
    "protocols": {
      "experience": {
        "tier": "PILOT",
        "profileLabel": "体验版",
        "participantConclusion": "本次体验版结果提示你在数字倒背中的任务表现。短程结果仅作初步任务表现参考。",
        "reportCaveats": [
          "体验版采用2–4 位数字。短程结果用于了解本次任务表现，条件内观察较少，不进入综合分析；数据质量不足时不作能力解释。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "standard": {
        "tier": "PILOT",
        "profileLabel": "正式版",
        "participantConclusion": "本次正式版结果提示你在数字倒背中的任务表现。结果仅作初步任务表现参考。",
        "reportCaveats": [
          "正式版采用2–7 位数字。结果应结合完成量、正确率和质量提示阅读，仅作为初步任务表现参考。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      },
      "research": {
        "tier": "PILOT",
        "profileLabel": "研究版",
        "participantConclusion": "本次研究版结果显示你在数字倒背中的任务表现。更多轮次可用于检验单次指标稳定性，不能据此认定稳定能力。",
        "reportCaveats": [
          "研究版采用2–8 位数字。增加观察量用于检验指标稳定性；研究版是轮次配置名称，不代表已通过研究级科学验证。",
          "结果不代表人口常模、年龄等级或诊断结论；三档沿用同一任务逻辑，但题量和部分阶段覆盖不同。"
        ],
        "showProductIndex": false
      }
    },
    "practicalTips": [
      "倒背要求在短时保持之外进行顺序操作，应与顺背结果分开阅读。"
    ],
    "singleHiddenMetrics": [],
    "disclaimer": "结果只反映本次数字倒背任务表现，不是完整工作记忆、Wechsler 等价值或年龄常模。",
    "reportReading": {
      "version": "1.0.0",
      "title": "把顺序倒过来，看看这一次",
      "introduction": "观察这次倒序复现数字的记录。",
      "summary": {
        "template": "本次正确倒序复现的最长数字序列为 {maxSpan}。",
        "metricKeys": [
          "maxSpan"
        ]
      },
      "studentMetricKeys": [
        "maxSpan",
        "totalCorrectTrials",
        "completedLevelCount"
      ],
      "processMetricKeys": [],
      "withholdFlags": [
        "legacyUninterpretable",
        "insufficientCompletedLevels"
      ],
      "metricGates": {},
      "nextStep": "倒背与顺背分别解释，不能拼成智商或一般工作记忆分。",
      "caveatTerms": {
        "正式版": "标准协议",
        "体验版": "短程协议",
        "研究版": "科研协议",
        "科研版": "科研协议",
        "科研档": "科研协议",
        "maxSpan": "本次最长正确序列长度"
      },
      "illustration": "sequence"
    }
  }
]
