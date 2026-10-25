# 15份量表的目录标签修订

本次只把已列入研究草稿的15份工具补充八轴命名空间标签，并将各自 `catalogManifestVersion` 从实际值1升至2。题文、评分、报告、参数、翻译身份及其版本均不变；取向轴没有直接来源支持时保持为空，不随意贴ACT/CBT/DBT。

`applied-source-mapping.json` 记录逐包旧/新标签、目录版本、源canonicalHash及不变内容hash。既有量表目录中的`local-validation.json`保留初次内容检查的历史source SHA，不冒充本次新目录源hash；本修订的独立证据见此映射和测试。

现有 `freezeScaleAxisSnapshot` 已把目录版本纳入axisHash，可在同measurement/C/P/R下新增目录快照；未升目录版本的不同源会报冲突。45项本地测试检查15份纯metadata差异、标签完整、通过真实freeze函数的模拟持久层验证旧快照保留及重放幂等；这不是数据库导入证明。

源码标签已应用，数据库导入由独立回执确认。现有Scale.tags仍只投影主领域，前端多轴筛选未因此自动完成；完整分类可随新sourceSnapshot持久化。72条全库拟映射继续留在1.0.0提案文件，不能把其余57条称已应用。
