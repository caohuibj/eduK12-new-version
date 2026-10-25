# PR354 后续修复记录

基准：2026-10-25 重新核实 PR354 已合并（00:37:36 UTC），远端 main
`25215dcc71dd7b4b205ebdef4c92ce9c5785836b`，PR354 最终 head
`e311a3cecf042be3793a411022a00371e5ac1602`。独立云端分支
`fix/survey-governance-followup-20261025`，开始时无工作区改动。

已读根 AGENTS.md、docs/release/README.md 的执行/验证/PR354 规则；仓库及
`/workspace/.agents` 无额外 SKILL.md。未访问 Mac、生产服务器或真实用户数据。

## 融合执行路线与状态

已直接读取 [Notion 路线图](https://app.notion.com/p/403d27635a388157aa34c83821491347)
和[证据报告](https://app.notion.com/p/402d27635a388106a8dbeafc7a2f6306)，原页面
编辑时间分别为 2026-10-24 18:48:19 / 18:48:32 UTC；这是历史来源，不修改它们。
核心目标为被试作答 → durable commit → 反馈/报告，减少等待与每份 CPU、内存、
DB 实工量/字节及存储；不以 SQL 数量代替净收益。

| 阶段 | 任务、依赖与边界 | 当前实际状态/证据 |
| --- | --- | --- |
| A 基准及正确性 | 01–07；先复现顺序/native/报告预算/拒答，冻结角色、版本与生命周期合同 | 基准已核实；01 已提交 4c54fafe，9 断言通过；02–07 进行中 |
| B 兼容整合 | 依赖 A；逐提交盘点 e0dd4300 的 receipt-only、请求内 runtime、窄状态、outbox、报告单读、认知 metadata、overview | 已核远端与历史证据；尚未整合，不以无冲突代替兼容证明 |
| C 新基线 | 依赖实际整合 source/config；普通、native mixed、整包报告，进程冷/热分别记录 | 新系列待冻结；历史 d01、31d9 及各候选原件不覆盖 |
| D 核心减工 | 08–13，以及 14–19 中已证明语义/成本的部分；发布编译复用、参与精确绑定、提交 fresh authority 与同请求事实复用 | 在 A 后按实际合同推进；不建平行 ordinary 协议/每 unit job/authority 缓存 |
| E 推进与报告 | 依赖 B–D 的合同证据；分离纯 next-plan 与准入/推进写，保逐单元保存、GET 恢复及两入口报告开放差异 | 本 PR 仅纳入已证明兼容片；显式 advance、正文迁移等先列方案 |

完成 A/局部 D 不等于路线图整体完成。旧 M1 ordinary schema 不是当前强前置；
“#354 未合并”和“冷暖从未测过”已过期。31d9 冷5/预热10/暖5 六组历史基线
确已执行；本次带新治理/整包报告的工作量没有新时间均值或容量结论。
raw SQL 父图实验虽省部分 Node CPU，DB 下行增加约 24–41%，本轮继续不接入；
第五片 callback/双披露方案已被 receipt-only 替代，不恢复。test-mode 跳过普通
Redis/IP 限流，不能当生产总成本。报告状态、生成与当前读取权限分开。

## 首批执行预算

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

## 02 native SJT 治理闭环

`snapshotUnit` 保留原 executionProtocol/header；合成试运行生成 native 输入/阶段
事件，调用同一 `prepareSituationalFinalSubmission` → `deriveSituationalFinalFacts`
→ `decodeSurveySituationalResult` → parent FINAL 事实消费。没有静态伪装、第二评分器、
人类 Attempt、Training 记录或逐 unit job。试运行证据明确 synthetic，原生 raw、
canonical/receipt 与报告进入既有治理 trial JSON 提交/回读，未作为参与者正式回执。

10 项局部断言通过（2 native V1/V2 + 8 原治理消费者），backend tsc 执行退出 0
（当时尚未加入后续 PG 测试文件；最终类型检查另记）。真实隔离 PostgreSQL 16
新建合成库运行 229 项现有迁移，没有生产迁移或复制已有数据。两种协议完整验证
新审批/3 case 试运行/回读、入口批准、新授权、导入/冻结、子提交竞态/重放、丢响应
read 恢复、parent FINAL 幂等与已配置报告值；撤销普通授权拒绝新参与，已准入
Attempt 可完成且 child raw 只有一份。V1 registry 仅注入原创测试身份，V2 经实际
author release 链；都不宣称真实目录已授权。原生 V1 无阶段 capture，V2 保留 capture。

首轮 PG：V1 通过；V2 夹具让作者审核自己，正确被既有保护拒绝。改用独立夹具
作者后只运行 V2，该项通过。原失败不改写，两个通过取不相交证据。文件：
`02-native-unit.json`、`02-native-postgres.json`、`02-native-postgres-v2.json`。

## 03/04 报告展开预算、读取防线与拒答

采用每份 FINAL 所有整包**合计 4,000,000 UTF-8 JSON 字节**，依据现有
publication 上限（publication.service.ts），低于 compact codec 的 8 MiB 明文
上限。密文合计上限为 `2 × 4,000,000 + 30 × 4096`，兼容 legacy hex 编码
约二倍放大及每包 envelope/header 余量；不是每包独立获得 4 MB。发布估计另留
每包 4096 字节，用于 artifact 元数据/固定生成器开销。字段文本按最多六字节/
UTF-16 code unit，标签按实际 JSON 转义 UTF-8，重复引用逐次计入，矩阵含每行
标签和全部可选值；不依赖条件跳过来削减预算。

提交审批列出可解释 blocker，审批再次验证；多个单独合格包在 wave 冻结时
检查总预算。生成时逐 block 检查，hash/encrypt/INSERT 前检查实际合计；读取
先锁最多 31 条 id/密文长度，超量或超字节不获取正文，再窄列读并检查解密后
实际合计及原 FINAL/report hash。没有截断答案或报告、异步化或改变开放时机。
历史超大/异常 artifact 会明确报预算错误，保留原件，未做数据重写/清理。

拒答只消费 normalizeFormAnswers 已验证的 missing 原因：REFUSED 与 NOT_SHOWN、
SHOWN_MISSING 区分，矩阵逐行显示；不重新评分。组件、结果、字段、missing、
metric 索引只在本次渲染复用，未缓存权限。

验证：10 个预算/拒答断言、4 个读取预算断言通过。实际 PG 的两包 FINAL 第二
report INSERT 强制失败时，parent FINAL/所有 report 均回滚，Attempt 保持 STARTED；
移除仅合成库 fixture trigger 后同命令重试完成，重放只有两份报告。发布测试
确认 200×合法长文本被审批拒绝，两个各 60 引用的合格包在冻结时拒绝总预算；
单包 10,000 个可转义字符可真实完成并完整读取 60 次引用，未截断。

原治理 PG 20 项中 18 通过（含新回滚与权限/历史保护）；两项全表空断言因先前
native 合成数据留在同一测试库失败。随后新建 schema-only 合成库，只重跑这两项
及它们必需的原表单创建前置案例，3/3 通过；未重跑其余 18 项。原失败保留。
追加发布预算案例 1/1 通过。原始证据：`03-budget-unit.json`、
`03-budget-read.json`、`03-governed-postgres.json`、
`03-governed-postgres-empty-scope.json`、`03-budget-publication-postgres.json`。
