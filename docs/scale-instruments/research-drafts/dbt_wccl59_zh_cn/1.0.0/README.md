# DBT-WCCL-59｜简体中文研究工作稿 1.0.0（等待进一步语言审校）

来源：Neacsiu 等（2010），DOI 10.1002/jclp.20685。基于[UW 官方繁体 59 题](https://depts.washington.edu/uwbrtc/wp-content/uploads/DBT-WCCL-Chinese.pdf)，核对[英文原题](https://depts.washington.edu/uwbrtc/wp-content/uploads/DBT-WCCL.pdf)，原作者[计分说明](https://depts.washington.edu/uwbrtc/wp-content/uploads/Scoring-description-for-the-DBT-WCCL.pdf)。**本版本不是UW官方简体中文题本，也未获中国内地效度验证**。

## 本轮中文语言处理
- 独立创建 `dbt_wccl59_zh_cn_research@1.0.0`；原官方繁体语言候选 `dbt_wccl59_zh_tw_official_research@1.0.0` **原样保留**。系统以不同 instrumentKey+locale 保留独立身份，避免覆盖已经保存的语言版本。
- 59道题逐条以中国内地日常成年人容易理解的措辞改写（非逐字机械繁简转换）；例如“討價還價／作出讓步”改为“通过协商或作出让步”，“懂得感恩”改为具体频率行为“想到生活中值得感激的事情”，“用一些在觸感上令自己舒服的東西來愛錫自己”调整为“用触感舒适的方式照顾自己”。
- 以“过去一个月，面对压力时，我曾经：”串联题目；按使用频率答题，不按有效性或道德评价。保留0从不／1很少／2有时／3经常（每周至少4～5次）。
- 新译稿需用户语言复审、双语专家逐题核对与认知访谈。简体表达不能视为获得官方同意、同一效度或新增临床规范。

## 锁定计分
- DSS 38项，独立均分0–3；DCS1 15项，独立均分0–3；DCS2 6项，独立均分0–3。题序及分维映射与UW繁体版完全一致，不反向，也没有59题总分或临床等级。
- 作者最低有效数：DSS 30/38，DCS1 10/15，DCS2 4/6。**平台保守complete_required**为每维全部回答才出该维分，与作者的最少有效数严格区分。
- 测量、计分、简体本地化、反馈报告版本单独1.0.0；本地常模、百分位、诊断切点缺失，不能推断人群差异或DBT疗效。
- 报告采用清楚易懂的成年人语言，解释三个应对频率维度；不把频率等同能力或疗效。

## 权利边界与开发状态
UW授权非商业研究、临床及教育用途，不等于许可独立中文译稿或公开GitHub全题文再分发。译者、翻译、电子施测、商业用途与对外转载由管理员审查，`license.status=unknown`、`redistribution=restricted`、`DRAFT/CANDIDATE` 不变。
原繁体源记录在 `dbt_wccl59_zh_tw_official_research@1.0.0`；简体稿的逐题待审问题在新版Word审校稿内。

本次仅静态比对59题唯一代码/顺序、原答题分值、38/15/6映射、三均值与原Golden Cases不变，并回读Git对象。Vitest、TypeScript、实际评分、CI、服务、数据库、人工科学验证及部署 **NOTRUN**。
