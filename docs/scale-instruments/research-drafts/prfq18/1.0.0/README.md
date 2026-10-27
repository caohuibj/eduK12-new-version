# PRFQ-18｜父母反思功能问卷：中文研究工作稿1.0.0

## 工具家族与人群
Luyten、Mayes、Nijssens、Fonagy（2017）的原版18题，官网：https://www.ucl.ac.uk/brain-sciences/pals/psychoanalysis/research/parental-reflective-functioning-questionnaire-prfq；作者署名完整题本：https://haruv-usa.org/wp-content/uploads/2022/09/The-Parental-Reflective-Functioning-Questionnaire.pdf。

**不是**12–18岁青少年PRFQ-A，也不是15题PRFQ-I；原作者明确建议只对家中**0–5岁儿童**使用这份原版。本工具catalog描述儿童0–5岁、respondentType=PARENT，运行适用策略用`subject.ageMonths < 72`作为目标儿童上界；年龄未知时不能确认适用。成人家长本人的角色及亲子关系应由实际产品适配层核实，不可把儿童年龄字段当成家长年龄。

## 题序、评分和解释
原版18题固定顺序，1–7七点同意度（原版正式锚点1非常不同意、4中立、7非常同意，其余只标数字）。没有全局总分。

| 原维度 | 原题序 | 计分 |
| --- | --- | --- |
| Pre-mentalizing (PM) | 1, 4, 7, 10, 13, 16 | 原值均分1–7 |
| Certainty about Mental States (CMS) | 2, 5, 8, **11**, 14, 17 | 11反向8−raw后均分1–7 |
| Interest and Curiosity (IC) | 3, 6, 9, 12, 15, **18** | 18反向8−raw后均分1–7 |

本版维度均采用高分=相应陈述被更多认可，不擅自合成“好父母指数”。**评分溯源冲突记录**：UCL首页文字对PM分数方向的说明与若干原研究阐释不一致，2020年一篇二次研究把11和16列为反向，但原版11/18为负向措辞、其他UCL衍生研究及多语种验证文献使用11/18。现冻结该18题结构的11/18转换供研发静态检查，但正式科学评审须对照**UCL最新英语 scoring syntax**独立复核，不能现在就宣称各项解释已最终批准或发布。

CMS和IC的得分不是简单单调越高越好，可能具有情境和人群差异。报告在`score_only`模式解释支持性反思，不使用中国常模/临床阈值。各6题维度完整才计算该维；缺失不插补是平台保守规则非作者正式插补。

## 版本与系统
内容`instrumentVersion=1.0.0`、`scoringVersion=1.0.0`、语言`localizationVersion=1.0.0`、引导语`instructionVersion=1.0.0`、报告`reportVersion=1.0.0`、参数`referencePolicy=none`。八轴标签加中文关键词，不修改共享评分器、数据库和实际部署策略。

## 权利和最小验证
UCL明确研究用途与独立翻译书面许可需求；作者联系由管理员独立协调，不阻塞草稿加工但不等于获得公开/商用权利。见`THIRD_PARTY_LICENSE.md`。

本轮仅进行题数、原题顺序、三个六题维度、11/18反向、12组合成算术用例及GitHub对象静态回读。Vitest、TypeScript、真实scoreScale/buildScaleResult、DB/HTTP、浏览器、CI、部署及人工译审均**NOTRUN**。保持DRAFT/CANDIDATE，不启用。
