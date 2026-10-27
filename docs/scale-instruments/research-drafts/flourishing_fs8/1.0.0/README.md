# FS-8｜独立简体中文研究工作稿 v1.0.0

## 研究来源与准确计分

原表 ©Ed Diener、Robert Biswas-Diener（2009），正式论文2010年卷期。官方英文PDF含8题、固定题序、1–7七级同意程度，以及唯一8–56理论总分。官网已有香港浸会大学译者署名的繁体中文版本；本包依英文原义独立制作简体工作译稿，不从其句子改写或直接复制，不能承继其授权或任何验证结论。

- 八题都按作答值原始求和，**无反向题、无八维分量表**，不与SPANE混为同一工具。总分越高只代表更认可关于意义、关系、投入和心理资源的描述，不是个人道德/学习能力、诊断或健康等级。
- 内容/计分 instrument1.0.0/scoring1.0.0；独立本地化 localization1.0.0 和 instruction1.0.0；参数 score_only/无ReferenceSet（不填低中高），报告 report1.0.0。
- 缺答：八题须完整才能计算总分，缺答不可插补。这是当前平台保守工作稿约定，非原作者正式缺失值政策。
- 八轴标签写入source，主要域WELL_BEING；许可、文化适配、译审、来源分别登记，不因英文研究证据就认为中文版已验证。

## 后续管理与工程状态

来源PDF：https://eddiener.com/wp-content/uploads/2024/09/Flourishing-Scale.pdf；官方繁体译本：https://eddiener.com/wp-content/uploads/2025/02/FS_Chinese.pdf 。详见 THIRD_PARTY_LICENSE.md。官网授权范围为署名的非商业研究，独立简体翻译/公开GitHub再分发/商用范围交由管理员决策。版权不妨碍内容草稿的研发与格式整理，但该提交不批准对外发布。

本工具按照现有 ScaleInstrumentSourceV1 / ScaleDefinitionV2 的单总分结构编制，不修改共享引擎、数据库、授权规则或前端。仅在远端进行来源、题序、计分算术、字段一致性与Git对象读回；Vitest、TypeScript、真实buildScaleResult、PG/HTTP、浏览器、CI、部署均 NOTRUN。正式状态始终DRAFT/CANDIDATE，未安装/未激活。
