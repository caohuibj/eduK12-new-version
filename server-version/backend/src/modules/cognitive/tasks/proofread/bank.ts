export const PROOFREAD_STIMULUS_SET_VERSION = 'proofread-zh-v1.1.0'
export type ProofreadItem = {
  id: string
  band: 1 | 2 | 3
  stem: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
  explanation: string
  correction: { fromText: string; toText: string }
  correctedStem: string
}

/** Original project-authored items. Explanations are editorial answer checks, not population validation. */
export const PROOFREAD_BANK: ProofreadItem[] = [
  {
    "id": "pf2-01",
    "band": 1,
    "stem": "他今天很高兴，一路上说说笑笑，不知不觉就到了校圆。",
    "options": [
      "高兴",
      "说说笑笑",
      "不知不觉",
      "校圆"
    ],
    "answer": 3,
    "correction": {
      "fromText": "校圆",
      "toText": "校园"
    },
    "explanation": "“校圆”应写为“校园”。",
    "correctedStem": "他今天很高兴，一路上说说笑笑，不知不觉就到了校园。"
  },
  {
    "id": "pf2-02",
    "band": 1,
    "stem": "我们要爱护公物，不要在墙上乱涂乱画，更不要损怀花草树木。",
    "options": [
      "爱护",
      "乱涂乱画",
      "损怀",
      "花草树木"
    ],
    "answer": 2,
    "correction": {
      "fromText": "损怀",
      "toText": "损坏"
    },
    "explanation": "“损怀”应写为“损坏”。",
    "correctedStem": "我们要爱护公物，不要在墙上乱涂乱画，更不要损坏花草树木。"
  },
  {
    "id": "pf2-03",
    "band": 1,
    "stem": "交作业前，我又仔细检杳了一遍，确认没有遗漏。",
    "options": [
      "作业",
      "仔细",
      "检杳",
      "遗漏"
    ],
    "answer": 2,
    "correction": {
      "fromText": "检杳",
      "toText": "检查"
    },
    "explanation": "“检杳”应写为“检查”。",
    "correctedStem": "交作业前，我又仔细检查了一遍，确认没有遗漏。"
  },
  {
    "id": "pf2-04",
    "band": 2,
    "stem": "他的成积一直在班里名列前茅，这次考试又得了第一名。",
    "options": [
      "成积",
      "名列前茅",
      "考试",
      "第一名"
    ],
    "answer": 0,
    "correction": {
      "fromText": "成积",
      "toText": "成绩"
    },
    "explanation": "“成积”应写为“成绩”。",
    "correctedStem": "他的成绩一直在班里名列前茅，这次考试又得了第一名。"
  },
  {
    "id": "pf2-05",
    "band": 2,
    "stem": "这本小说情节曲拆离奇，读起来引人入胜，让人爱不释手。",
    "options": [
      "情节",
      "曲拆离奇",
      "引人入胜",
      "爱不释手"
    ],
    "answer": 1,
    "correction": {
      "fromText": "曲拆",
      "toText": "曲折"
    },
    "explanation": "“曲拆”应写为“曲折”。",
    "correctedStem": "这本小说情节曲折离奇，读起来引人入胜，让人爱不释手。"
  },
  {
    "id": "pf2-06",
    "band": 2,
    "stem": "虽然天气很热，但是他还是坚持锻练身体，从不间断。",
    "options": [
      "天气很热",
      "坚持锻练",
      "从不间断",
      "虽然"
    ],
    "answer": 1,
    "correction": {
      "fromText": "锻练",
      "toText": "锻炼"
    },
    "explanation": "“锻练”应写为“锻炼”。",
    "correctedStem": "虽然天气很热，但是他还是坚持锻炼身体，从不间断。"
  },
  {
    "id": "pf2-07",
    "band": 2,
    "stem": "这篇文章按排合理，条理清楚，是一篇难得的好文章。",
    "options": [
      "按排合理",
      "条理清楚",
      "难得的好",
      "文章"
    ],
    "answer": 0,
    "correction": {
      "fromText": "按排",
      "toText": "安排"
    },
    "explanation": "“按排”应写为“安排”。",
    "correctedStem": "这篇文章安排合理，条理清楚，是一篇难得的好文章。"
  },
  {
    "id": "pf2-08",
    "band": 2,
    "stem": "听到夺冠的消息，同学们欢呼鹊跃，久久不愿离开。",
    "options": [
      "夺冠",
      "消息",
      "欢呼鹊跃",
      "离开"
    ],
    "answer": 2,
    "correction": {
      "fromText": "欢呼鹊跃",
      "toText": "欢呼雀跃"
    },
    "explanation": "“欢呼鹊跃”应写为“欢呼雀跃”。",
    "correctedStem": "听到夺冠的消息，同学们欢呼雀跃，久久不愿离开。"
  },
  {
    "id": "pf2-09",
    "band": 3,
    "stem": "面对困难，我们不能退缩，要勇敢地迎接挑占。",
    "options": [
      "面对困难",
      "退缩",
      "勇敢地",
      "挑占"
    ],
    "answer": 3,
    "correction": {
      "fromText": "挑占",
      "toText": "挑战"
    },
    "explanation": "“挑占”应写为“挑战”。",
    "correctedStem": "面对困难，我们不能退缩，要勇敢地迎接挑战。"
  },
  {
    "id": "pf2-10",
    "band": 3,
    "stem": "科学家们废寝忘食地工作，终于攻刻了这道难题。",
    "options": [
      "废寝忘食",
      "工作",
      "攻刻",
      "难题"
    ],
    "answer": 2,
    "correction": {
      "fromText": "攻刻",
      "toText": "攻克"
    },
    "explanation": "“攻刻”应写为“攻克”。",
    "correctedStem": "科学家们废寝忘食地工作，终于攻克了这道难题。"
  },
  {
    "id": "pf2-11",
    "band": 2,
    "stem": "他的演说博得了热烈的掌生，会场的气氛非常活跃。",
    "options": [
      "演说",
      "博得",
      "掌生",
      "活跃"
    ],
    "answer": 2,
    "correction": {
      "fromText": "掌生",
      "toText": "掌声"
    },
    "explanation": "“掌生”应写为“掌声”。",
    "correctedStem": "他的演说博得了热烈的掌声，会场的气氛非常活跃。"
  },
  {
    "id": "pf2-12",
    "band": 3,
    "stem": "这份报告直接影响了公司的战略部署，意议非常重大。",
    "options": [
      "报告",
      "战略部署",
      "意议",
      "重大"
    ],
    "answer": 2,
    "correction": {
      "fromText": "意议",
      "toText": "意义"
    },
    "explanation": "“意议”应写为“意义”。",
    "correctedStem": "这份报告直接影响了公司的战略部署，意义非常重大。"
  },
  {
    "id": "pf2-13",
    "band": 3,
    "stem": "那里的风景真是一绝，山清水秀，鸟语花香，令人流连忘反。",
    "options": [
      "风景",
      "山清水秀",
      "鸟语花香",
      "流连忘反"
    ],
    "answer": 3,
    "correction": {
      "fromText": "流连忘反",
      "toText": "流连忘返"
    },
    "explanation": "“流连忘反”应写为“流连忘返”。",
    "correctedStem": "那里的风景真是一绝，山清水秀，鸟语花香，令人流连忘返。"
  },
  {
    "id": "pf2-14",
    "band": 1,
    "stem": "这次活动圆满结素，同学们都表示收获很大。",
    "options": [
      "活动",
      "圆满结素",
      "同学们",
      "收获很大"
    ],
    "answer": 1,
    "correction": {
      "fromText": "结素",
      "toText": "结束"
    },
    "explanation": "“结素”应写为“结束”。",
    "correctedStem": "这次活动圆满结束，同学们都表示收获很大。"
  },
  {
    "id": "pf2-15",
    "band": 2,
    "stem": "他做事总是一丝不句，从不马虎，深得老师的信任。",
    "options": [
      "一丝不句",
      "从不马虎",
      "深得",
      "信任"
    ],
    "answer": 0,
    "correction": {
      "fromText": "一丝不句",
      "toText": "一丝不苟"
    },
    "explanation": "“一丝不句”应写为“一丝不苟”。",
    "correctedStem": "他做事总是一丝不苟，从不马虎，深得老师的信任。"
  },
  {
    "id": "pf2-16",
    "band": 2,
    "stem": "在老师的帮助下，班里的学习风气焕然一新，同学们的精社面貌也大大改观。",
    "options": [
      "帮助",
      "焕然一新",
      "精社面貌",
      "改观"
    ],
    "answer": 2,
    "correction": {
      "fromText": "精社",
      "toText": "精神"
    },
    "explanation": "“精社”应写为“精神”。",
    "correctedStem": "在老师的帮助下，班里的学习风气焕然一新，同学们的精神面貌也大大改观。"
  },
  {
    "id": "pf2-17",
    "band": 1,
    "stem": "春暖花开的季结，公园里游人如织，到处是赏花的人群。",
    "options": [
      "春暖花开",
      "季结",
      "游人如织",
      "赏花"
    ],
    "answer": 1,
    "correction": {
      "fromText": "季结",
      "toText": "季节"
    },
    "explanation": "“季结”应写为“季节”。",
    "correctedStem": "春暖花开的季节，公园里游人如织，到处是赏花的人群。"
  },
  {
    "id": "pf2-18",
    "band": 1,
    "stem": "他的性恪很开朗，跟谁都合得来，朋友们都很喜欢他。",
    "options": [
      "性恪",
      "开朗",
      "合得来",
      "喜欢"
    ],
    "answer": 0,
    "correction": {
      "fromText": "性恪",
      "toText": "性格"
    },
    "explanation": "“性恪”应写为“性格”。",
    "correctedStem": "他的性格很开朗，跟谁都合得来，朋友们都很喜欢他。"
  },
  {
    "id": "pf2-19",
    "band": 3,
    "stem": "这本书内容详实，图文并茂，是一本不可多得的佳做。",
    "options": [
      "内容详实",
      "图文并茂",
      "不可多得",
      "佳做"
    ],
    "answer": 3,
    "correction": {
      "fromText": "佳做",
      "toText": "佳作"
    },
    "explanation": "“佳做”应写为“佳作”。",
    "correctedStem": "这本书内容详实，图文并茂，是一本不可多得的佳作。"
  },
  {
    "id": "pf2-20",
    "band": 2,
    "stem": "我们应当从实际出发，实事求是地分西问题、解决问题。",
    "options": [
      "实际出发",
      "实事求是",
      "分西问题",
      "解决问题"
    ],
    "answer": 2,
    "correction": {
      "fromText": "分西",
      "toText": "分析"
    },
    "explanation": "“分西”应写为“分析”。",
    "correctedStem": "我们应当从实际出发，实事求是地分析问题、解决问题。"
  },
  {
    "id": "pf2-21",
    "band": 2,
    "stem": "他热情的帮助了我，我很感激他。",
    "options": [
      "热情的",
      "帮助了我",
      "感激",
      "他"
    ],
    "answer": 0,
    "correction": {
      "fromText": "热情的",
      "toText": "热情地"
    },
    "explanation": "“热情的”应写为“热情地”。",
    "correctedStem": "他热情地帮助了我，我很感激他。"
  },
  {
    "id": "pf2-22",
    "band": 2,
    "stem": "虽然他的身体不太好，但是他仍然坚持工作，从无愿言。",
    "options": [
      "身体不太好",
      "坚持工作",
      "从无愿言",
      "虽然"
    ],
    "answer": 2,
    "correction": {
      "fromText": "愿言",
      "toText": "怨言"
    },
    "explanation": "“愿言”应写为“怨言”。",
    "correctedStem": "虽然他的身体不太好，但是他仍然坚持工作，从无怨言。"
  },
  {
    "id": "pf2-23",
    "band": 1,
    "stem": "妈妈让我放学后直接回家，不要在路上逗溜。",
    "options": [
      "放学",
      "直接回家",
      "在路上",
      "逗溜"
    ],
    "answer": 3,
    "correction": {
      "fromText": "逗溜",
      "toText": "逗留"
    },
    "explanation": "“逗溜”应写为“逗留”。",
    "correctedStem": "妈妈让我放学后直接回家，不要在路上逗留。"
  },
  {
    "id": "pf2-24",
    "band": 2,
    "stem": "他的态度很坚诀，不管别人怎么劝说，他都不肯改变主意。",
    "options": [
      "态度",
      "坚诀",
      "劝说",
      "改变主意"
    ],
    "answer": 1,
    "correction": {
      "fromText": "坚诀",
      "toText": "坚决"
    },
    "explanation": "“坚诀”应写为“坚决”。",
    "correctedStem": "他的态度很坚决，不管别人怎么劝说，他都不肯改变主意。"
  },
  {
    "id": "pf2-25",
    "band": 1,
    "stem": "参观展览时，我们应当尊守秩序，轻声交谈。",
    "options": [
      "尊守",
      "秩序",
      "轻声",
      "交谈"
    ],
    "answer": 0,
    "correction": {
      "fromText": "尊守",
      "toText": "遵守"
    },
    "explanation": "“尊守”应写为“遵守”。",
    "correctedStem": "参观展览时，我们应当遵守秩序，轻声交谈。"
  },
  {
    "id": "pf2-26",
    "band": 2,
    "stem": "演出结束后，观众按照工作人员的引导，有秩续地离开会场。",
    "options": [
      "演出",
      "引导",
      "有秩续",
      "会场"
    ],
    "answer": 2,
    "correction": {
      "fromText": "秩续",
      "toText": "秩序"
    },
    "explanation": "“秩续”应写为“秩序”。",
    "correctedStem": "演出结束后，观众按照工作人员的引导，有秩序地离开会场。"
  },
  {
    "id": "pf2-27",
    "band": 2,
    "stem": "收到新书后，小林迫不急待地打开包装，读了起来。",
    "options": [
      "收到",
      "新书",
      "包装",
      "迫不急待"
    ],
    "answer": 3,
    "correction": {
      "fromText": "迫不急待",
      "toText": "迫不及待"
    },
    "explanation": "“迫不急待”应写为“迫不及待”。",
    "correctedStem": "收到新书后，小林迫不及待地打开包装，读了起来。"
  },
  {
    "id": "pf2-28",
    "band": 3,
    "stem": "这次取得进步后，我们还要再接再励，认真完成后续任务。",
    "options": [
      "进步",
      "再接再励",
      "认真",
      "后续任务"
    ],
    "answer": 1,
    "correction": {
      "fromText": "再接再励",
      "toText": "再接再厉"
    },
    "explanation": "“再接再励”应写为“再接再厉”。",
    "correctedStem": "这次取得进步后，我们还要再接再厉，认真完成后续任务。"
  },
  {
    "id": "pf2-29",
    "band": 2,
    "stem": "既使遇到暂时的挫折，我们也不会放弃已经确定的目标。",
    "options": [
      "既使",
      "暂时",
      "挫折",
      "目标"
    ],
    "answer": 0,
    "correction": {
      "fromText": "既使",
      "toText": "即使"
    },
    "explanation": "“既使”应写为“即使”。",
    "correctedStem": "即使遇到暂时的挫折，我们也不会放弃已经确定的目标。"
  },
  {
    "id": "pf2-30",
    "band": 3,
    "stem": "两位作者对同一场景作出了裁然不同的描述，引起读者讨论。",
    "options": [
      "作者",
      "场景",
      "裁然不同",
      "讨论"
    ],
    "answer": 2,
    "correction": {
      "fromText": "裁然不同",
      "toText": "截然不同"
    },
    "explanation": "“裁然不同”应写为“截然不同”。",
    "correctedStem": "两位作者对同一场景作出了截然不同的描述，引起读者讨论。"
  },
  {
    "id": "pf2-31",
    "band": 2,
    "stem": "为了按时完成任务，负责人提前作出了周密的部暑。",
    "options": [
      "任务",
      "负责人",
      "周密",
      "部暑"
    ],
    "answer": 3,
    "correction": {
      "fromText": "部暑",
      "toText": "部署"
    },
    "explanation": "“部暑”应写为“部署”。",
    "correctedStem": "为了按时完成任务，负责人提前作出了周密的部署。"
  },
  {
    "id": "pf2-32",
    "band": 1,
    "stem": "雨停以后，远处的山峰渐渐变得清淅可见。",
    "options": [
      "雨停",
      "远处",
      "山峰",
      "清淅可见"
    ],
    "answer": 3,
    "correction": {
      "fromText": "清淅",
      "toText": "清晰"
    },
    "explanation": "“清淅”应写为“清晰”。",
    "correctedStem": "雨停以后，远处的山峰渐渐变得清晰可见。"
  },
  {
    "id": "pf2-33",
    "band": 1,
    "stem": "新学期开始，教室里换上了斩新的桌椅。",
    "options": [
      "新学期",
      "教室",
      "斩新",
      "桌椅"
    ],
    "answer": 2,
    "correction": {
      "fromText": "斩新",
      "toText": "崭新"
    },
    "explanation": "“斩新”应写为“崭新”。",
    "correctedStem": "新学期开始，教室里换上了崭新的桌椅。"
  },
  {
    "id": "pf2-34",
    "band": 3,
    "stem": "多年过去，那次旅行的情景依然让我记忆由新。",
    "options": [
      "多年",
      "旅行",
      "情景",
      "记忆由新"
    ],
    "answer": 3,
    "correction": {
      "fromText": "记忆由新",
      "toText": "记忆犹新"
    },
    "explanation": "“记忆由新”应写为“记忆犹新”。",
    "correctedStem": "多年过去，那次旅行的情景依然让我记忆犹新。"
  },
  {
    "id": "pf2-35",
    "band": 2,
    "stem": "小朋友们全神贯住地听故事，连下课铃响了都没有察觉。",
    "options": [
      "全神贯住",
      "故事",
      "下课铃",
      "察觉"
    ],
    "answer": 0,
    "correction": {
      "fromText": "全神贯住",
      "toText": "全神贯注"
    },
    "explanation": "“全神贯住”应写为“全神贯注”。",
    "correctedStem": "小朋友们全神贯注地听故事，连下课铃响了都没有察觉。"
  },
  {
    "id": "pf2-36",
    "band": 2,
    "stem": "见到久别的朋友，两个人不约尔同地笑了起来。",
    "options": [
      "久别",
      "朋友",
      "不约尔同",
      "笑了起来"
    ],
    "answer": 2,
    "correction": {
      "fromText": "不约尔同",
      "toText": "不约而同"
    },
    "explanation": "“不约尔同”应写为“不约而同”。",
    "correctedStem": "见到久别的朋友，两个人不约而同地笑了起来。"
  }
]

import { cognitiveBankMetaSchema, type CognitiveBankMeta } from '../../banks/bank-meta'
export const bankMeta: CognitiveBankMeta = cognitiveBankMetaSchema.parse({
  stimulusSetVersion: 'proofread-zh-v1.1.0',
  source: 'Original project-authored Chinese items; manually reviewed with item explanations. No third-party test items.',
  license: 'internal-generated',
  itemSetRole: 'form',
})
