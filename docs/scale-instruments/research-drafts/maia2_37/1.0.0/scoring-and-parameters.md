# 计分与版本

原值0–5，仅0 Never/5 Always有原始文字锚点；第5、6、7、8、9、10、11、12、15题x′=5−x，其余x′=x。分量表题号分别1–4、5–10、11–15、16–22、23–27、28–31、32–34、35–37；各维均分Σx′/本维题数，范围0–5，无整体总分，不把分维均值再平均成总分。

作者个人评分说明未规定漏答阈值。项目保守complete_required逐维：某维漏一题该维null，其他完整维可计算；不填0、不插补、不按比例换算。当前引擎只要有canonical score不可计算，整体quality=invalid并抑制所有报告解释；这是运行时表现，不能冒称原作者推荐删除其他完整维分数。原论文探索分析完整案例/CFA最大似然处理不是个人计分缺失规则。

内容instrumentVersion=1.0.0、scoringVersion=1.0.0、localizationVersion=1.0.0；报告reportVersion=1.0.0。参数计划parameterPlanVersion=1.0.0、NONE_SCORE_ONLY。当前referencePolicy.type=none无独立运行时参数version，只记录功能差异、不改引擎。没有适用的中国常模/临床阈值，不迁移外国参数，不造百分位、轻中重或高低级别。

hashScaleDefinition存在versionAxes时绑定内容与计分轴，报告另有reportVersion；目录标签更改不改内容hash，报告版本更改也不改内容hash，题文更改会改变hash。
