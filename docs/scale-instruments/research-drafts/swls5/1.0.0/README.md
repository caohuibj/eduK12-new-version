# SWLS-5｜中文研究工作稿 1.0.0

## 内容身份与来源

`swls5_zh_cn_research@1.0.0`。原量表Diener、Emmons、Larsen和Griffin（1985）5道英语题；以作者网页官方7点原版固定题序为基准：https://eddiener.com/wp-content/uploads/2024/09/SWLS-Scale.pdf 。

本版独立译为简体中文，既非官网由Mantak Yuen特别许可翻译的繁体研究版，也不是5级或3题变体。官方中文原件仅链接，见 THIRD_PARTY_LICENSE.md。每题一套七档同意度锚点，依原始1–7分直接计分，不作反向。

## 内容／参数／报告独立版本

- 内容 instrument1.0.0；计分 scoring1.0.0；中文本地化 localization1.0.0；指导语 instruction1.0.0：完整五题，固定次序，不增设回顾期。
- 参数：referencePolicy=none / score_only；无ReferenceSet，不自动启用作者PDF的七档经验解释。原作者官网另有评分解释指南且分档边界不同，需后续决定是否制定独立P版本；不得当中国常模或临床界值。
- 报告 report1.0.0：唯一总分，日常语言解释和可选行动，不作人格、疾病、生活价值判断。不存在未经证实的单题子量表。
- 平台草稿缺答政策：五题全部有效才计算总分（5–35）；缺答不补零、不插补；这是平台约定，不冒称作者规则。

## 八轴与适配

已经分别写入 domain / construct / orientation / population / response / use / license / language_validation，以及中文关键词。标签是检索与管理信息，不是授权或验证事实的替代。当前内容源能被ScaleDefinitionV2的七级选项、sum、完整作答及score_only报告结构表达，无需改共享引擎。

## 权利/管理员事项

官网允许作者署名的非商业研究使用；独立中文译稿、公开GitHub再分发或商业扩大范围待管理员选择和确认。来源与两版官方题本链接见 THIRD_PARTY_LICENSE.md。科研人工译审、目标样本认知访谈及中国本地验证也未完成。

## 本批验证口径

只对正式题本、题序、七档锚点、五题计分边界和六份合成向量进行静态构造检查，并在GitHub远端回读对象。Vitest/TypeScript、真实scoreScale/buildScaleResult、PG/HTTP/浏览器、CI和生产均 NOTRUN，不能把提供的测试源码或合成预期记成运行通过。始终 DRAFT/HIDDEN，未安装/未激活/未合并主干。
