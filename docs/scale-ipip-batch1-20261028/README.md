# IPIP 三包内容批次

来源固定为 `content/dot-local-scales-20261025@b92c69aefa2472775fa7ee86b9c208366886c908`；基线 main `aa774983db8edd85b3c1617aef7218f71664746d`。三位 Terra 6.1 high 各审一包，root 统一集成。每包独立 commit，没有另造引擎、注册表、导入路径或共享接口。

| 工具 | 题数 / 计分 | instrument / scoring / localization / instruction | report | 当前真实状态 |
|---|---|---|---|---|
| IPIP-NEO C1 自我效能 | 10题，6正4反，总分10–50 | 全部1.0.0 | 1.0.1 | 静态注册；隔离库安装并 PUBLIC/SURVEY；正式库未操作 |
| IPIP-NEO C5 自律 | 10题，5正5反，总分10–50 | 全部1.0.0 | 1.0.0 | 同上 |
| IPIP NFC 思维需求 | 10题，6正4反，总分10–50 | 全部1.0.0 | 1.0.1 | 同上 |

仅绑定既有双语稿 `/instructions` 原文至现行 instruction schema，注明工作稿精确来源，并将代码包技术 `releaseStatus` 从 DRAFT 调整为 PUBLISHED 候选。三份完整 definition 保持，既有题意、选项、公式、阈值、报告和 golden 不变；原 catalog CANDIDATE、scientificMaturity PILOT、译审/专家 PENDING、缺失 scientificReview 和权利声明不变。不声称 root 已独立批准本包、不将英文 IPIP 公有领域扩张到专有 NEO-PI-R、第三方中文译本或项目效度。

当前索引：[index.json](index.json)；逐包源 blob/hash/版本/精确差异：[packages.json](packages.json)；独立审计：[audits](audits)。每包准备时的 NOT_EXECUTED、原研究材料的 DRAFT 和历史 local-validation 是历史事实；当前隔离状态以 index/evidence 为准，不改写原记录。

本批六个内容用例、一次生成索引检查成功；实际业务入库使用与 CLI 相同的既有 install/publish 函数，在全新 `eduk12_ipip_0cd9fe6030` 中完成三包安装、冻结、发布和目录回读。合成 SYSTEM_ADMIN，没有全量 seed。每包初始 DRAFT/HIDDEN、ACTIVE revision1，随后显式 PUBLIC / allowedProducts=[SURVEY]，各1条 measurement release/审计；真实用户 capability、组织、被试和生产均未操作。完整业务原件以 gzip 原字节保存，路径/hash 映射在 [transport.json](transport.json)，摘要在 [isolation-summary.json](evidence/isolation-summary.json)。

用户已纠正检查范围。本批曾重复进行逐包幂等/拒绝和手机平板显示检查，结果保留，但后续取消作为普通包准入条件。详见 [scope-review.md](scope-review.md)：逐包检查内容、计分、报告引用和版本；通用渲染与四入口授权属于系统合同，只有对应系统变化或具体缺陷才补验。实际安装发布操作仍保留既有动态安全校验。

六张已完成截图保存在 [presentation](presentation)，为固定 PR367 前端组件与原合成结果的演示；不将它们变成每包额外验收，也不视为生产、完整端到端或四入口授权实测。浏览器使用云端现有容器启动配置（Chromium内部sandbox=false，外层托管环境未变），API/外部请求被阻止。未记录的执行时间/完整前后清单如实注明。

Draft / [skip ci]，未自行激活 CI、Ready、合并、部署或写生产库。PR367/370 尚未合入 main；届时只需正常整合生成索引并按实际差异判断受影响证据，不全量重跑。最终独立复核与正式入库由 root 协调。
