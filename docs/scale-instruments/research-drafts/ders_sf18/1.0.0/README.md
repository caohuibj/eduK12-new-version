# DERS-SF-18｜中文研究工作稿 v1.0.0

源量表是Kaufman等DERS-SF 18题短式（2015年作者上传题本，2016年论文），并非DERS-16或Victor/Klonsky其他DERS-18版。

正式来源：https://www.researchgate.net/publication/286383944_DERS-SF_scoring_and_measure ，论文：https://psych.utah.edu/_resources/documents/people/crowell/Kaufman_Crowell_DERS-SF_2016.pdf 。

原题序1–18固定。五级频率锚点1几乎从不(0–10%)、2有时(11–35%)、3约一半时间(36–65%)、4多数时候(66–90%)、5几乎总是(91–100%)。只有**1/4/6**三题反向（6−原分）。原题本没有指定过去一周/两周的回顾窗口。

## 计分定义

| 输出 | 题号 | 运算／范围 |
| --- | --- | --- |
| 总分 | 所有18题 | 反向处理后求和18–90 |
| Strategies | 10、15、18 | 均分1–5 |
| Non-acceptance | 7、12、16 | 均分1–5 |
| Impulse | 9、14、17 | 均分1–5 |
| Goals | 8、11、13 | 均分1–5 |
| Awareness | **1、4、6反向** | 均分1–5 |
| Clarity | 2、3、5 | 均分1–5 |

维度分采用作者允许的均值方案，以便保持1–5频率量尺；总分仍用18–90，不混用两种值。分数越高仅意味着对应困难报告得更多，不代表疾病诊断、能力价值或临床分级。

平台工作稿保守缺答策略：某维三题完整才计算对应维度、18题全部完整才算总分，不插补。非原作者已确认的缺失政策。

## 系统集成与版本

内容instrument1.0.0、计分scoring1.0.0、独立中文localization1.0.0、指导语instruction1.0.0、报告report1.0.0；参数 `referencePolicy=none`，解释按 `score_only`，无中国常模或临床阈值。八轴标签 domain/construct/orientation/population/response/use/license/language_validation 加中文关键词。

仅使用当前ScaleDefinitionV2的reverse/sum/mean/缺答与报告字段，不修改共享引擎。定向Vitest是附带源码，没有运行。当前只对原作者题序、键、JSON、合成数值和Git对象做静态核对，**Vitest/TypeScript/真实scoreScale/buildScaleResult/数据库/浏览器/CI/生产均NOTRUN**。版权待办由管理员处理，草稿未激活。
