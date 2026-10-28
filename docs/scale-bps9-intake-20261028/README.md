# BPS-9：固定指导语绑定与单包隔离入库

基线 main `642fda7ab754790686d6626efac62b73a332e663`，独立分支
`content/scale-bps9-intake-20261028`；不修改 PR367、其他量表、前端、共享引擎、
schema 或 CI。精确清单、版本、命令/退出/原件入口见 [index.json](index.json)。

修改 → 检查：既有 BPS-9 source 指导语未接入当前 schema → 选中注册合同、指导语冻结、
历史报告兼容和索引；执行本节点单包 CLI → 核对安装/发布前后实际业务状态。
预算为数分钟，不运行全库、全量 seed、类型/构建、独立 golden 回放或 CI。

## 精确来源与适配

来源 `b92c69aefa2472775fa7ee86b9c208366886c908`，identity
`bps9_zh_cn_research:1.0.0`。main、PR328/362 和相关旧量表分支的八个固定快照
中仅找到一个该身份来源，见 identity-sources.json，不泛称覆盖未来分支。

复用原路径的 13 文件，其中 12 文件字节一致；source 只增加 instruction 和将
技术 releaseStatus 从 DRAFT 置为 PUBLISHED，准备交 root 独立复核。
指导语 text 原样来自原 instruction.for-pr356.json，instructionVersion→version、
locale→language，另记录固定来源。没有新编指导语或伪造审校状态。
这不是声称 root 已批准本包、科研/译审完成或生产已公开。

题本、选项、公式、report、golden、原 license 等均未改写。
instrument/instruction/scoring/report/localization 各版本均 1.0.0，参数明确 none。
保留 CANDIDATE/PILOT、专家/译审 PENDING、scientificReview 缺失和原版权声明。
原文档的历史状态与历史验证记录保持原归属，不重标为本次执行。
旧 validation.md 的批次相对链接对应
[固定来源原件](https://github.com/caohuibj/eduK12-new-version/blob/b92c69aefa2472775fa7ee86b9c208366886c908/docs/scale-instruments/batches/20261026-wave4/validation.json)。

## 题目、计分、报告及图表审计

对照[作者 2014 论文及附录](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2014.00611/full)
和固定双语稿，保留成人原九题、原频率端点、中间数字、反向题2/3/7/9。
不混用八题改编或其阈值。当前包声明等权均分1–5、全题齐答、不插补，
原论文不被冒称完整软件计分手册。代码与声明一致，未改变成熟量表含义。

原报告已有温暖具体的收尾建议、生活约束解释和使用限制，没有诊断、排名或常模；
本次不为形式强改。原 score description 中“9题反向后”的说法可以进一步明晰，
但该字段参与 measurement hash，未原地改动1.0.0；明确的四个反向键保持正确。
图表仍用一个真实均分及理论范围，不能换成人群排名。
已保存报告中有公开的已答/应答和方向字段，其呈现增强由独立 PR367 承担。
手机/平板截图在本批首次准备时 NOTRUN，不能用结构检查冒充视觉验收。
科研、译审、版权沟通和文案判断不新增为自动准入门禁。

## 本次实际状态

全新合成库 `eduk12_bps9_518fa660de`，loopback55432，使用现有迁移初始化，
无 seed、无权限配置变更，一个合成 SYSTEM_ADMIN。

| 操作 | 实际结果 |
| --- | --- |
| 未安装 publication preview | 退出2，拒绝；无业务写入 |
| install preview | 退出0，允许；无业务写入 |
| 首次 install apply | 退出0，DRAFT/HIDDEN + ACTIVE revision1，冻结 source/版本轴 |
| 重复 install apply | 退出0，所核业务行/updatedAt/冻结内容完全一致 |
| PUBLIC / allowedProducts=[SURVEY] preview | 退出0，proof明确绑定；无业务写入 |
| publication apply + 原 proofHash | 退出0，合成库 PUBLISHED/PUBLIC，一条 release、一条发布审计 |
| Survey 目录/入口 | 精确1.0.0 available=true，实际入口 policy守卫通过 |
| Training 新增使用 | 未选择此入口，实际守卫拒绝 |
| School/Teacher | BPS组织适配/分发未执行，未伪称四入口上线 |

27 项隔离断言通过，外层/检查均0；预期拒绝的 CLI 退出2仍保留2。
源码只在本分支，生产从未查写；无真实人员 capability/material/survey grant，
无被试作答。标准包公共发布沿用 Scale/release/policy/audit，另一个自编量表治理
表 scale_library_entries 仍为0，不另造入库系统。

## 原检查与缺项

首轮定向用例1 PASS/1 FAIL、外层1；索引检查0。
失败是新增兼容用例把历史报告 envelope 当结果解析。保留原 test/report，
仅改读 result 并补实际 measurementHash 对应断言，失败项单独1 PASS/1 filtered、
外层0；未重跑第一项，也未重新计算历史报告。
执行前后输入 hash 一致，完整依赖/环境字节未枚举，原件未签名。
迁移 stdout 以无损 gzip 保留，见 evidence/log-transports.json。

本 PR 是待独审的技术内容和隔离证据，正式 CI、Ready、main 合并与生产部署仍未执行。
后续按真实 main 对齐，尤其与 PR367 的 generated index 合并时用既有生成脚本处理。
