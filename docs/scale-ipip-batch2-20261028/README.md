# IPIP 第二批：内容审计与源码候选

基线 main `8774b1cf158dae1c5eb0f4950044c6ae6d6a18dd`，固定来源 `content/dot-local-scales-20261025@b92c69aefa2472775fa7ee86b9c208366886c908`。三位 Terra 6.1 high 各只读审一包，由 root 核对并按包提交。系统修复由 dot 负责，本批不修改系统。

| 包 | 题数 / 计分 | instrument / scoring / localization / instruction | report | 本次变更 |
|---|---|---|---|---|
| IPIP-OPT10 乐观倾向 | 10题，4正6反，总分10–50 | 均1.0.0 | 1.0.1 | 绑定已有工作指导语；准备技术发布候选 |
| IPIP 同情关怀10题 | 10题，5正5反，总分10–50 | 均1.0.0 | 1.0.0 | 同上 |
| IPIP 情绪关注10题 | 10题，5正5反，总分10–50 | 均1.0.0 | 1.0.1 | 同上 |

完整 executable definition、题文/选项、计分、报告、参数引用和 golden 均与固定来源相同。每包只在 source 添加既有 bilingual-content.json `/instructions` 的逐字指导语及来源，并将技术包 releaseStatus 从 DRAFT 准备为 PUBLISHED 候选；此状态不代表科研批准、译审完成、数据库发布或独立复核完成。仍为 CANDIDATE/PILOT，译审/专家 PENDING，scientificReview 缺失和原权利声明不变。没有给任何真实人、组织或入口授予权限。

当前状态：已加入既有静态源码注册索引；本批数据库安装、PUBLIC发布、目录可见、实际分配均 **NOT_EXECUTED**；生产未操作。待 dot 独立复核后按既有业务安装/发布路径推进，不能把本 PR 写成正式公共库已上线。原研究材料中的 DRAFT、旧 local-validation、runtime-check 只是历史原件，本次未改写或冒充新执行。

内容审查覆盖逐题原意与译文、锚点、正反向、分数方向、缺失和分母规则、参数/报告引用、版本、报告措辞及建议。现有报告已通俗、具体，未为形式重写；无经验阈值/常模，不增加百分位、排名或高低分类。十题完整作答才求和是项目实现，不能冒称 IPIP 官方统一缺失规则。成人自陈的 student 是现有技术角色，不表示未成年人适用。

剩余人工事项：同情关怀第6/10题 little 的程度与中文“很少”的频率歧义、第8题自然度；情绪关注第3题“当下”、第8题“不太能觉察”的译文细节。保留原题待独立译审；任何拟改变题意、锚点或算法的修订需协调版本及用户确认。三个包的中文目标人群验证和认知访谈仍未完成。乐观草稿备选题均分不是当前输出；同情关怀研究包 dimensionCount=1 表示单一构念，运行定义是1个 total、0个 dimension，不新增假维度。IPIP 公有领域声明限该 IPIP 内容，不延伸到专有 NEO、IRI、LOT-R 或其他第三方译本。

## 本批实际检查

唯一主要执行位置为本云端。三项选中包合同断言通过；既有 registry readiness 在同一进程为三包分别消费3/5/3组已有 golden，仅一次，没有另外回放 scorer。一次生成索引一致性检查通过。两条实际命令退出0、stderr空、前后输入清单一致；外层 Python 包装命令也由执行工具确认退出0。没有运行 Vitest 全套、tsc、全库、构建、浏览器/截图、四入口、安装、幂等、数据库、CI或部署。旧系统、显示和权限结果不改写为本批通过。

原始结果：[selected-content.json](evidence/selected-content.json)，精确 fullName、命令/时间/退出码及日志哈希：[execution-receipt.json](evidence/execution-receipt.json)。保守源码清单记录 backend 源文件/锁文件/配置的前后哈希，不声称这些都被执行测试，也不声称完整 node_modules 字节已绑定。实际运行 harness 为 [check-selected.ts.txt](check-selected.ts.txt) 的同字节 `.ts` 临时副本，执行后移除；没有新增长期测试或 CI 系统。

逐包原文件 blob/SHA256、前后源哈希、两处 JSON 差异、版本和状态见 [packages](packages)；独立只读审计原件见 [audits](audits)。本次可读取的43个相关远端 head 中，这三个 key/version 各仅固定 b92 来源，无已知同身份冲突，main 不含这些包；[source-discovery.json](source-discovery.json) 保留准确范围。另2个 cognitive/SJT 远端 head 的对象未读取，明确列 unknown，不冒称全 GitHub 无冲突；PR328/362 当前 head 已回读未变化，历史盘点不视作当前安装数。

仅新增这三包及其原路径研究材料、既有 generated 索引与必要证据。Draft / [skip ci]，未触发 CI、Ready、合并或部署。PR367/370/371 仍须 dot 统一处理；整合时若只需重新生成同身份索引，不自动使未变内容证据失效，不全量重跑。
