# 认知内容审核与入库准备

本候选从公开 PR441 的既有实现中抽取20项任务，沿 main 现有 task-package、计分、profile、报告和生成工具接入；不包含 IRT/CAT、矩阵v2、数据库改造或权限平台。main 原有任务未改。

## 范围

20项：numberline、arithverify、sizecongruity、delaydiscount、gamblingdeck、symbolmatch、runningspan、sentencecheck、seqlearn、timecopy、letternumseries、semanticfluency、cancellation、trustgame、ufov、pursuitrotor、visualwm、maze、auditoryrt、auditorynback。

另为 main 已有15项推荐 DRAFT 配置准备精确安装和独立发布输入，不从源码声明推断数据库当前状态。其余候选及具体缺口见 pending-review.md，单项摘要在 reviews/。

## 版本与报告

新20项 engine/config/report definition/presentation/reading 为1.0.1；原 profile 次数和计分阈值保持。19项 scorer 仍1.0.0；maze 的输入合同修复为1.0.1，合法路径公式未变。sizecongruity与maze的指标元数据修订为1.0.1。旧任务和旧报告继续使用既有冻结关系。

报告描述本次自然指标、实际分母、缺失与真实零以及有符号差；关闭产品指数，使用referenceMode:none，不编常模、诊断、年龄排名或稳定能力等级。报告增加可理解的解释、反思与行动建议；已有合格内容不为凑工作量重写。

## 已完成的验证与限制

首次任务定向执行：37个前端文件共163例，161通过、2失败；20项contract/readiness/fixture-scorer-report通过。两处失败修复后仅复验受影响两套件，10/10通过；原失败未改写。maze新增2条拒绝回归通过，过滤项不计通过。20项报告指标引用与40份双profile纯合并通过。

后端任务类型闭包零诊断；前端app类型修正测试mock声明后通过；变化文件lint两处表达式错误修正后受影响文件零错误。完整后端类型检查仍有依赖生成与声明可移植性的环境限制，不将任务定向结果冒称完整后端或正式CI成功。

20项均完成390/1440实际界面核看，并覆盖光条复位、第二题续行、零号探测、目标运动及音频用户手势启动等受影响短流程。它们为合成宿主界面证据，不是HTTP交卷、真实数据、数据库、归档、权限或物理计时认证。

原始执行证据保留在原环境供核验，本交付集不包含原始日志、环境清单、浏览器原件或待审修订patch。未上传原件不等于没有验证，也不表示正式门禁已接纳这些本地结果。

## 准备输入与未执行部分

install-selection.json / publication-selection.json 为20新候选的现有CLI精确输入；main-existing-drafts-install.json / main-existing-drafts-publication.json 为15项main既有推荐配置的输入；source-config-inventory.json是源码声明清单，不是目标数据库清单。

安装只写DRAFT/GRANT，发布、PUBLIC和入口/用户授权相互独立。本候选没有执行目标数据库安装、公开发布或生产部署，没有激活CI或合并任何旧PR。

现有管理员审核页面尚未接通未安装认知seed的直接入库；该接线作为独立本地变更处理，不属于本403文件范围。正式CI、应用产物与目标库实际状态仍由母DOT定版后办理。本交付集保持等待明确公开许可。
