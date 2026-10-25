# 计分与外部参数

{
  "totalScore": null,
  "totalScoreProhibited": true,
  "reverseItems": [],
  "subscales": [
    {
      "id": "victim",
      "label": "自己处于不利位置",
      "items": [
        1,
        2
      ],
      "formula": "mean of two items",
      "range": [
        1,
        6
      ]
    },
    {
      "id": "observer",
      "label": "看到他人受到不公平对待",
      "items": [
        3,
        4
      ],
      "formula": "mean of two items",
      "range": [
        1,
        6
      ]
    },
    {
      "id": "beneficiary",
      "label": "自己从不公平中获益",
      "items": [
        5,
        6
      ],
      "formula": "mean of two items",
      "range": [
        1,
        6
      ]
    },
    {
      "id": "perpetrator",
      "label": "自己造成不公平",
      "items": [
        7,
        8
      ],
      "formula": "mean of two items",
      "range": [
        1,
        6
      ]
    }
  ],
  "higherMeaning": "Stronger reported reactions to injustice from the respective viewpoint; not moral worth or objectively observed conduct"
}

Each pair must be complete to score that subscale; never prorate or impute individual report. Project can require all8 for complete report.
Author says aggregate subscale only when neither item missing. Population-study MI/FIML is not an individual-report fill-in rule.

No established diagnostic cutoff; no invented low/medium/high or percentiles. External sample means are not cutoffs and are not runtime-selected.
本实现要求全题完整才提供完整报告，不声称缺失时仍提供局部维度。
