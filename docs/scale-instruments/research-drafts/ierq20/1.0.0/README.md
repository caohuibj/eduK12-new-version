# IERQ-20｜独立中文研究工作版本 1.0.0

**当前状态：**已静态注册可执行来源版本（DRAFT/HIDDEN），不是已安装量表、不是正式授权或通过科学验证的中文版。日期：2026-10-27；独立中文题本与报告均为平台工作草稿。

## 来源与精确版本

Hofmann, Carpenter & Curtiss (2016), *Cognitive Therapy and Research* 40(3), 341–356，DOI 10.1007/s10608-016-9756-2。唯一原版载体是原论文 Appendix I 的20题和指导语，不取用早期105题/60题池，也不使用后来14题三维改编。复核依据：https://pmc.ncbi.nlm.nih.gov/articles/PMC4864994/

原文20题的中文工作译稿完整位于 `server-version/backend/src/modules/scale/instruments/ierq20_zh_cn_research/1.0.0/source.json` 的20条 items，原文与译本存在来源关系，不继承其他中文译本验证；英文原题不在本公开仓库另复制一套。

## 原计分

| 四个维度 | Appendix I题号 | 理论范围 |
| --- | --- | --- |
| 增进积极情绪 Enhancing Positive Affect | 3、6、8、13、18 | 5–25 |
| 借助不同视角 Perspective Taking | 2、7、10、14、17 | 5–25 |
| 安慰 Soothing | 4、9、12、16、19 | 5–25 |
| 社会示范 Social Modeling | 1、5、11、15、20 | 5–25 |

全部20题使用符合程度1–5，**全正向**，四维分别求和，不合成单一总分、能力评分、治疗效果或临床标签。无作者规定固定时间窗口。本项目保守缺答规则：一维5题齐全才计算该维，其他完整维可单独呈现；这是平台策略，非作者缺失算法。

## 三版本与标签

内容/计分 instrument1.0.0/scoring1.0.0、独立中文本地化 localization1.0.0、报告report1.0.0；参数 score_only / referencePolicy=none，不创造中国常模或分档。八轴事实标签已经写入 source.catalog.construct.constructOverlapTags；授权标签只作为管理员待办，不向系统授予权限，也不证明标签真实消费已经执行。

## 兼容性

原题序、独立指导语、无反向、四维各5题求和与普通人可读的score_only报告，均能用2026-10-27内容分支已存在的source schema/ScaleDefinitionV2表达。**不需要调整schema、共享计分引擎或运行时**。静态内容结构及手算模拟向量是本次记录；真实schema解析、TypeScript、Vitest、buildScaleResult、隔离PG、HTTP/浏览器、CI、生产、双入口均NOTRUN。

## 权利与验证

详见 THIRD_PARTY_LICENSE.md。作者联系/再分发范围/商业用途交由管理员决定，不阻断内容草稿；当前license为unknown/restricted而非verified。已发表2021年中国大学生(N=987)验证不属于本独立译本，目标人群没有被验证。所有来源/计分/反向映射均需在后续正式使用前进行人工译审与必要科学评估。
