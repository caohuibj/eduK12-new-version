# DMEE-Class-T 教师自评频次报告

本组对应同目录下的 8 份 2023 年作者英文版 Form。每份独立图文导读对应一个最终分组。沿用补充材料 S1 的题文和七级频次选项，按 S5 最终题项编组。原研究以法文施测。这里的英文分类报告面向成年教师反思，不能据此判断教师实际教学质量、学生学习或人员表现。 [原始论文](https://doi.org/10.3389/feduc.2023.1281431) · [S1 与 S5](https://doi.org/10.3389/feduc.2023.1281431.s001) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

- [目标导向](orientation/review.md)
- [结构组织](structuring/review.md)
- [提问](questioning/review.md)
- [策略示范](modeling/review.md)
- [应用练习](application/review.md)
- [学习环境](learning_environment/review.md)
- [评价](assessment/review.md)
- [差异化](differentiation/review.md)

## 读取已有 Survey 汇总

在现有 Survey 项目中使用索引指定的 Form 和相同的 `instrumentKey` 进行波次组织。由获授权的人员从相应波次的现有 `GET /api/survey/projects/:pid/analytics/waves/:wid/items` 路径获得汇总 JSON，最多 250 个 FINAL。另存该 JSON，再在本目录执行

```sh
node report-summary.mjs orientation path/to/survey-item-analysis.json
```

程序核对已有 Form 的文件摘要和已有波次题文、题号与选项，输出逐题类别人数、有效分母与比例。零个有效回答时，比例为 null。题本允许留空。缺失状态按平台已记录的信息保留，题本没有新增拒答选项。无题项数据时返回 `NO_ITEM_DATA`，不把尚无数据写成零次发生。不从逐题描述推导均分、潜变量或任何教师等级。八个分组不相加，未恢复原研究 ESEM 因素分数。

报告程序在下载后的数据上本地运行，没有平台接口、数据库、部署或新增权限。仅输出选定 Form 的汇总，不包含项目、波次、人员标识、原答卷或自由文本。项目外分享继续遵循现有匿名、汇总和权限规则。文案及插画为项目原创，插画复用已审阅的对应素材。
