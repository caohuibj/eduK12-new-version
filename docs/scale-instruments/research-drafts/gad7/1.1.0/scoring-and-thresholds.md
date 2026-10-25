# 计分与外部参数

{
  "total": "sum(all 7 scored symptoms)",
  "total_range": [
    0,
    21
  ],
  "reverse": [],
  "missing": "Platform conservative policy: all 7 scored responses valid 0..3 integers required. Any missing/invalid => no total or band; no imputation. This is not claimed as the authors sole missingness rule.",
  "direction": "更高表示过去两周报告的相应困扰更频繁"
}

完整症状题才算总分，未答不当0。独立开发者7题版本，总0–21；不是删去所选题本附题。

全部外部阈值与原样本人群/回忆时段在external-reference-dossier.json，runtime references=[]、referencePolicy=none。不把英文敏感性/特异性冒充当前中文表现。
