# PR354 后续修复记录

> 此文件保留另一恢复会话的历史执行记录。当前融合路线、最新用户政策决定、
> 提交及验证边界统一维护在 [任务主记录](survey-governance-followup-20261025.md)。
> 下文“21–25 待决策”等描述已被主记录中的后续明确决定覆盖。

本任务在独立 Codex 云端环境执行。基线为已合并 PR354 的最新 main
`25215dcc71dd7b4b205ebdef4c92ce9c5785836b`，PR354 于
2026-10-25 00:37:36 UTC 合并，head 为 `e311a3cecf042be3793a411022a00371e5ac1602`。
工作分支 `fix/survey-governance-followup-20261025`；没有使用旧审计 head。
没有操作 Mac、生产、真实用户数据，没有合并或部署。

## 范围与执行位置

先处理 native SJT 治理试运行与新授权、组合报告展开预算/拒答，再处理局部重复读取、分页、版本和导航。
正确性合同和真实 PostgreSQL 流程以本云端为主要执行位置；不运行无关全平台或压力测试。
每片按约 30 分钟定位/验证预算推进；等待项单独报告，预算不代表容量或性能承诺。
普通工作分支 push 不匹配主 CI 的 main push；其他 push 工作流只匹配其固定分支。
最终创建 draft PR 会触发实际 PR 分类及 Situational publication；不改弱门禁，不声称 draft 可合并。
没有找到仓库或环境 `.agents` 中的技能文件；已读取根 AGENTS.md 和发布规则的适用条款。

旧性能分支只读核实为 `e0dd43000e059b0e5732b82274330489cfade58e`，没有 merge/cherry-pick。
其 Survey 交集包含 `situational-native.service.ts`；本片不修改该文件。
不覆盖旧 d01/31d9 基线，不把 SQL 次数变化当成普遍性能收益。

## 已有修复与新增修复

01 main 仍存在问题。再次直接读取 `git show origin/main:.../governed-package.service.ts`
确认 main 未校验真实 Flow 的顺序。本会话先前读取工作区时，另一并发会话已经加入该修复，
故最初误判为合并版已有修复；此处明确更正。
当前工作分支的 `4c54fafe` 增加真实工具执行序列校验及 `governed-package-flow.test.ts`。
倒序、外部工具、缺失/重复、条件、END、experiment 和合法原序/既有材料规则的
9 项执行证据由另一会话记录在 `docs/survey-governance-followup-20261025.md`，
本会话没有重新运行或独立验收该组。

02 合并版仍会在 `snapshotUnit` 丢失 native 协议，且试运行把 native descriptor 当静态问题。
现保留冻结协议，在治理试运行中生成明确标记的合成输入，复用共享 native 提交准备、路径与 capture 校验、
原评分器、canonical 结果、原回执解码及父 FINAL 计算。合成 trial 只写原治理试运行表，
不会创建人类 Attempt、放行授权或冒充浏览器操作。V1 无 capture，V2 保留真实分阶段协议。
参与者结果读取仅将原解码函数导出复用，当前授权和事务锁仍由原调用方负责。

## 本云端验证（非 CI 资格）

Node 24.21.0，仓库既有锁定依赖。数据库为新建 loopback
`survey_followup_test_520cedcef5b0`，229 份既有迁移在空合成库应用；未修改迁移、未迁移开发或生产数据库。
仅注入全新合成 registry identity/PILOT 声明；没有修改实际来源、许可或科学定义。

- `governed-native-trial.test.ts`：V1/V2 两项合同通过，各执行三个合成评分/报告/回执案例。
- `governed-native.postgres.integration.test.ts`：V1/V2 两项真实数据库流程通过，覆盖系统审批/试运行提交回读、
  必需 Survey 范围批准、新授权和只读导入、冻结版本、子结果/父 FINAL、非法 hash 拒绝、过时审批拒绝、
  幂等重放和丢响应后读取相同回执、撤回阻止新入场且既有冻结作答仍能完成、旧 FINAL 保持原值。
- 首次组合执行 4 项中 3 项通过、1 项失败：V2 测试 registry 注入后未配套其合成科学声明。
  修正仅限该合成 identity 的测试 seam，随后只重跑失败的 V2 流程，通过。保留首次失败报告，不声称首次整体成功。
- 后端 `tsc --noEmit --pretty false` 退出 0。

本会话原记录摘要：`eduk12-native-trial-initial.json` SHA-256
`c68c31fb4fdc02fd13fd5cb43185a2ab9538bd3843fd341d10b2350072b35991`；
`eduk12-native-qualification-1.json`
`8c86792cb8daa1ef47ef24dfdcc92590a6d176121adb541fee5570103d3c1b4b`；
仅 V2 重跑 `eduk12-native-qualification-v2-retry.json`
`a07ba5ab3b3046d2454a9d77ba6baaa228183e54861852d9f02f37b8b24f11ed`。
类型输出为空，观察到进程实际退出 0；不单凭空文件断言成功。

原 JSON/type 记录在云端 `/tmp/eduk12-*`，不上传原始日志、答卷、凭据或请求头。
原生浏览器图片解码、UI 到数据库端到端、压力/竞态基准与正式 CI 尚未由本片重新验证；
合成输入和数据库流程不能替代这些证据。

## 后续片与保留决策

03–13：报告预算/拒答、来源分页搜索、精确版本/可用性、导航和事务内去重继续按片推进。
14–19：只实施能证明同请求不可变闭包的部分；复杂存储/恢复迁移、异步报告和盲目新增索引不进入本轮。
20：保留不可变触发器、FK 和审计历史，不改删除制度。
21–25：Training 附加能力、撤权效力、三轴/runtimeHash 模型、统一异步物化及双人审批均待用户决策。
School/Teacher 全套适配不扩展。

## 并发写入边界

2026-10-25 00:54 UTC 发现同一 checkout/分支存在另一执行会话持续写入及提交。
该会话提交 `4c54fafe`、`52412feb`，本会话提交 `cac178f7`；期间代码和测试互相可见。
本会话保留所有改动，没有 reset、覆盖回退或另开竞争 PR；已询问由谁接手，答复待定。
为避免覆盖，停止报告预算及后续重叠文件写入。此记录只陈述本会话实际执行的测试；
另一份记录中的 V2 author-release 链、子提交竞态等须与其原源码/原报告另行核对，
当前本会话的 PG 测试对 V1/V2 都使用合成 registry/scientific seam，不声称覆盖这些额外路径。
