# PR354 后续修复记录

基准：2026-10-25 重新核实 PR354 已合并（00:37:36 UTC），远端 main
`25215dcc71dd7b4b205ebdef4c92ce9c5785836b`，PR354 最终 head
`e311a3cecf042be3793a411022a00371e5ac1602`。独立云端分支
`fix/survey-governance-followup-20261025`，开始时无工作区改动。

已读根 AGENTS.md、docs/release/README.md 的执行/验证/PR354 规则；仓库及
`/workspace/.agents` 无额外 SKILL.md。未访问 Mac、生产服务器或真实用户数据。

## 执行清单

| 修改组件 | 已确认问题与必需检查 | 主要位置及预算 |
| --- | --- | --- |
| 整包发布 | units 顺序正确时 Flow 仍可倒序/插入外部工具；直接冻结函数负例与原序正例 | 此云端，首片约 10 分钟 |
| native SJT 治理 | snapshotUnit 丢失 native 协议，试运行误用静态问题；共享 prepare/derive、receipt 与新授权闭环 | 此云端合成库，约 20 分钟 |
| 报告 | 重复字段可放大，读取无总字节预算；发布最坏展开估计、生成/读取防线、拒答与矩阵 | 此云端合成库，约 20 分钟 |
| 管理/UI 和精简 | 分页/版本/可用性及同事务去重；保 fresh 权限与冻结版本 | 前三片完成后据代码收敛范围 |

上述是执行预算，不把尚未运行的检查称为通过。现有 #354 官方结果仅在消费输入
不变且正式复用规则适用时参考，不冒充本次新输入的验证。

## 工作流边界

实际读取 `.github/workflows/ci.yml`：push 只匹配 main；PR opened/synchronize
等事件匹配 main。独立 measurement-browser/shared-assessment-foundation 的 push
仅匹配各自固定分支。本分支可分片提交并 push，不靠 skip-ci 文本控制触发。
创建 draft PR 时仍可能运行分类和 draft 检查；不改弱 required gate、不手动运行
full/probe、不合并、不部署。

## 旧性能分支交叠

只读核实 `perf/training-survey-core-20261024` =
`e0dd43000e059b0e5732b82274330489cfade58e`，未合并。其先前的
request-local `verifySurveyFinalPublication`、selectedSnapshot、collection stop
批检查等做法已有部分进入 main；本次在 main 上核对，不 merge/cherry-pick 旧分支。
`d01`/`31d9` 性能证据保留，不与新增治理/报告工作量作因果对比。

## 政策边界

21–24 待讨论：不扩 material.distribute 权限，不改撤权效力，不迁移三轴/文献模型，
不统一物化/异步报告或改变反馈时机。25 已决定本期不新增双人审批，保留单人系统
管理员的 MFA、原因、范围、时效、审计及撤销校验。School/Teacher 不扩展治理。

## 01 实际施测顺序

`freezeGovernedPackages` 现在额外比较 Flow 实际 INSTRUMENT 序列的连续片段与
批准 bindings。保留原有无条件 MATERIAL 呈现规则；不允许其携带条件绕过整包。
结果数组顺序不能证明施测顺序，因此仍分别校验 units、绑定/定义与 Flow。

直接调用冻结函数的 9 个断言：旧 main 真正执行后 7 通过、2 失败（倒序和外部
工具插入均被错误接受）；修复后 9/9 通过。缺失、重复、条件、END、experiment
拒绝及原序/材料/旧无 Flow 均覆盖。仅新发布准入变化，不改冻结 Attempt/报告。
原始 JSON 保存在云端 `/workspace/survey-followup-evidence/01-order-{red,green}.json`。
首次收集被环境预装 Zod 3 与 main 锁定 Zod 4 不一致阻断，未计入断言；按 main
原锁文件从官方 npm ci 后生成 Prisma client，依赖和锁文件均未改动。
