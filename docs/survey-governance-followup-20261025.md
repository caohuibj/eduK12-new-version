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
| A 基准及正确性 | 01–07；先复现顺序/native/报告预算/拒答，冻结角色、版本与生命周期合同 | 01–07 已实现并有局部/合成 PG 证据，见各节；用户新政策 21/22 继续实施 |
| B 兼容整合 | 依赖 A；逐提交盘点 e0dd4300 的 receipt-only、请求内 runtime、窄状态、outbox、报告单读、认知 metadata、overview | 9a1cc142 / 39784cfe 已逐片整合；overview 等余项仍须精确盘点 |
| C 新基线 | 依赖实际整合 source/config；普通、native mixed、整包报告，进程冷/热分别记录 | 新系列待冻结；历史 d01、31d9 及各候选原件不覆盖 |
| D 核心减工 | 08–13，以及 14–19 中已证明语义/成本的部分；发布编译复用、参与精确绑定、提交 fresh authority 与同请求事实复用 | 08–13、15 已有定向证据；14、16–19 尚需结构和成本证明 |
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

最新用户决定覆盖先前“21–24 均待讨论”的历史状态：

- 21 已选 B：正式入口管理员分配所有**本入口已准入**的精确版本；受委托人员仍需
  精确能力许可。先证明 Training 入口准入判定，不以全球 ONLINE 代替；不批量改生产授权。
- 22 已决定立即停止：受影响授权/版本撤销须阻止新准入及后续采集/提交，保留数据。
  现有代码/旧测试的“已开始默认可继续”是待修改差异，不再是新设计目标。历史报告
  是否停止展示仍待澄清，不扩大为删除。
- 23 已选 B：共享不可变内容/参数/报告正文，批准组合与发布引用，作答引用该发布/
  组合。未正式上线，无需默认永久双写/双读/旧协议层。旧测试版本可以清理，但实际
  永久删除须先列具体环境、ID、引用/附件和保留基线并获对应范围确认；可用新合成库开发。
- 24 已批准方式 2：原始事实 + 已有权威计分产生的少量规范化总分、维度分、必要质量
  标记及精确计分/批准组合引用；报告按需渲染，统计/导出复用结果、不重计分。
  不逐答卷复制参数、模板、报告正文，不默认异步。native 原件、时序/路径/质量及
  严格回执保留。历史报告停止范围仍未决定；不能据此直接删旧 artifact 或最终事实。
- 25 本期单人系统管理员授权，保留 MFA、原因、范围、时效、审计及撤销校验，不新增双人规则。

School/Teacher 不扩展治理。21/22 的新政策修订需单列完整受影响消费者与验证，不能
把当前行为的回归通过标成新政策完成。

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

## 并发会话归属与证据修订

00:54–00:56 UTC 同 checkout 的另一个恢复会话提交了 `cac178f7`、`e2f81200`。
已保留，未 reset 或覆盖。其 `docs/pr354-followup.md` 是历史执行记录；本文件为
融合路线/当前状态的唯一入口。native helper 被等价提取为可复用的合成输入生成器，
PG 测试文件也被替换成 registry/scientific seam 版本。因此上节本会话原始 PG JSON
保留为当时源码执行，不伪称当前测试文件完整复现那份旧报告。

当前另外新增一个不覆盖原 cases 的 V2 实际 author-release 案例，验证来源审批、
治理 trial、真正新授权/冻结、并发 native child 提交/回执恢复、parent 重放、单份
raw 与配置报告值 5；`02-native-author-current.json` 1/1 通过。另一个会话的两项
registry PG 结果按其独立 `/tmp/eduk12-*` 原件/来源保留，不声称由本会话重跑。

## D：08–11 同事务减工与 13 渲染索引

严格 governed APPROVED 校验后仍逐次检查 sourceGrant ACTIVE，再跳过同事务较弱
policy 重读；其他来源/暂停检查不变。Survey 管理员复用 assertEntryAdmin 的
STANDARD/user/grant 锁与有效性证明，系统管理员 library 例外不变。

packageBoundCatalogSnapshots 在一次调用中按 exact tool ID/hash 复用已锁定父包；
每个成员仍验绑定身份、定义和 hash，下一请求重新验证。冻结准入只读一次项目
owner，逐项 live grant 保留；FINAL 复用已选择 snapshot。报告每次渲染建立字段/
missing/metric 索引。没有跨请求权限缓存。

证据：72 个既有受影响 FINAL/策略合同通过，5 个新事务复用断言（不同请求重验、
成员/身份篡改、不同 hash、历史读、逐 grant 检查）通过；当前新鲜 schema-only
合成库中 21 个治理 PG 案例全部通过，包括权限、整包、原子失败/重试、报告预算。
输入变化使这组 DB 消费者需要复验，不是重复无关检查。证据为
`08-11-contracts.json`、`08-11-reuse.json`、`08-11-postgres.json`。
这些是冗余减少与正确性证据，尚无 CPU/时延普遍提速结论。

## A/D：05–07、12、13 管理和选择器

整包可分配目录、研究者整包授权、现有授权、系统来源/组件均采用 page/hasMore；
来源/组件/整包查询在分页前按名称或精确标识搜索。组件合并查询以原 GOVERNED
分组、title/id 与 STANDARD tool_key/id 排序，移除静默 LIMIT 200。来源选择明确
排除已治理副本，并保留原来源授权校验；筛空页面有 hasMore 时仍可继续。切组件页
保留已选 exact type/id/hash 的元数据，不替换组件或追新。

三轴版本及短 hash、整包成员的精确版本与无参数/无报告说明直接显示。整包授权
列表显示尚未生效/到期、工具未上线/已停止、Survey 范围未批准或暂停等当前阻塞；
ACTIVE 只是记录状态，动作继续完整 fresh 校验。系统管理员改看独立入口管理员
任命交接，不显示无法访问的人员分配链接。研究者与邀请切页仅刷新各自列表。

管理目录改为明确摘要列，SQL 不向 Node 传 executable/scoring/template/Reference
正文，组件元数据只按精确 source id/hash 联接；policy 一次批量读取。响应标记
`summaryOnly`/`FULL_EXACT_ARTIFACT_AT_ACTION`，不冒充完整科学/来源验证，审批/分配/
导入仍 hash 完整 artifact。详细页和组件指标按显式操作读取、准备，不跨请求缓存
authority。此处是减少无用传输/构造，不宣称降低全部 DB 实工量或普遍提速。

证据：28 份真实合成目录/组件/授权的 4 项 PG 断言按 2+2 不相交通过；全部新
版本按数据库保护从 SUBMITTED 经实际审批/3 case trial 才 ONLINE。最初错误夹具
直接 INSERT ONLINE 被原触发器拒绝；随后到期夹具违反有效期约束也被拒绝。
只修合成夹具、补 MFA/稳定排序；保护未放松，首轮未运行的断言不算通过。

UI 原消费者 7 项通过；新增分页 5 项首轮通过，导航夹具漏 content/deployment
状态而失败，补齐只重跑导航 1 项通过；独立列表翻页 1 项通过，原研究者 UI
21 项通过。来源旧合同 14 首轮通过、13 因未适配 main 新治理索引的 mock 失败；
仅补明确 raw-only 查询夹具和真实 entry/index 次数，13 项单独通过。无新授权或
计分断言被减弱，PG 有真实角色拒绝证据。前后端类型退出 0；8 个变更前端文件
lint 0 error/4 warning（含数值 epoch ref 和既有 effect 依赖提示）。尚无本批编译
浏览器/移动布局或公网性能证明，CI 资格另记。

原件：`05-12-list-postgres-{fixed,retry}.json`、`05-07-ui-{existing,paging,navigation}.json`、
`13-independent-pages.json`、`13-researcher-ui.json`、`05-source-contracts{,-retry}.json`。

## B：旧性能分支的精确整合

`9a1cc14240919055adcbf63ce17ad3f9abcbb939` 只采用以下三份原提交的完整局部 diff，
没有 merge/cherry-pick 整个分支。已核 main31d9 → main25215 这三份生产文件无变化，
逐 patch `git apply --check` 成功；当前消费路径再运行新输入的合同。

| 原提交 | 本次采用范围 | 必须保持的合同 |
| --- | --- | --- |
| c73976cc1119222baeaa29944c7c9b6af40699e4 | form-facts.ts + single-parse test | V2/V3 strict schema、去重及 512 KB 均保留，只消除第二次 parse |
| a2180188db5283c15b0ea66ab1e1bd90f65afed9 | report-outbox.service.ts + definition projection test | async=false 且未入组才省 definition；已有入组、flow、fresh parent 与配置切换仍校验 |
| dd69272c6f88b5816957935644102f378a15ca12 | cognitive/assignment.service.ts + metadata test | 原归属、PUBLISHED、独立任务筛选/顺序、恢复与冻结 hash 保留，DTO 不变 |

实际命令为 backend `vitest run` 上述三个 test 文件，36 项通过
（`B-perf-selected.json`）。没有新的全流程 CPU/时延或容量结论。
receipt-only、窄 composite 状态、Scale runtime 复用、Training report single-view
后续已在第二批逐消费者整合；overview opt-in 尚待整合。所有修复仍仅在候选分支。

### B 第二批：显式 receipt-only 与报告 single-view

采用 e0dd4300 中这些相互依赖的精确文件净差异：composite 的状态子 header/
controller/query schema/report read/service，Scale 的 final/workflow/unified final 与
`services/scale-final-submit.schema.ts`，前端 composite 两个既有 host/API/types/
receipt recovery 及对应七组后端、六组前端合同。main31d9→25215 上这些生产文件
字节未变；完整局部 patch 通过 `git apply --check`。没有采用第五片 callback，
没有整个父图 raw SQL、ordinary schema、每 unit job 或提前成功 ACK。

当前单元仍加载权威 runtime；所有 child header 保留以检查非法分卷注入。
prepared runtime 仅同一请求、assessment ID/epoch/hash/原密文精确一致时复用。
只有两个已知前端 host 显式请求 receipt；旧默认详情和 GET 恢复保留，receipt
事务不取无用 cipher。report combined view 仍按当前身份/epoch/开放状态取正文，
READY hint 不授权正文，不把报告工作塞入提交 ACK。

首轮后端 106 通过、6 个 query schema 断言失败，类型指出遗漏了原候选的一个
schema 导出。补齐该精确依赖文件后只运行六个失败断言，6/6 通过；原 106 保留。
前端 71 项通过。前后端类型均实际退出 0。证据：
`B-receipt-report-backend.json`、`B-receipt-schema-retry.json`、
`B-receipt-report-frontend.json`，以及 `*-types-receipt*.log`。尚无本批新 HTTP /
浏览器/CPU 均值或生产资格；原候选的受控 probe 也不冒称本批已执行。

## D：15 去标识投影提前

系统独立导出在已授权 source load 时显式选择正向 choice 白名单，在访问值/转成
raw observation 前跳过自由文本、日期等。最终去标识白名单仍保留，导出前后 grant
核对不变。普通授权 raw 查看仍可读取原值，未从原件删除任何内容或重计分。
14 项定向合同通过，包括用访问即抛错的排除字段证明它未被投影（默认普通路径
仍访问），以及原隐私/链接/analytics 消费者（`15-deidentified.json`）。

## 父对话定向反馈补证

`39784cfe3cf64333e799a968ecd524a8a1c6dc2a` 已推送；远端 main 仍为
`25215dcc71dd7b4b205ebdef4c92ce9c5785836b`，这些是本任务候选修订，不是 main 已修复。

原 01 的 9 例为 freeze mock 合同。另加真实编译的合法 units=[A,B,C]、Flow=[A,C,B]
拒绝，units=[A,B]、Flow=[B,A] 拒绝，以及含合法 MATERIAL title/body 的原序通过，
三项均经过实际 compiler→freeze。仅运行这三个新例，未重复原九例。
同工具第二 grant 已撤销或过期仍逐项拒绝，两个新例通过。
`review-compiler-grants.json` 合计 5/5。

METRIC 预算移除固定 240 字符单位假设，使用每个冻结 native/cognitive compiled runtime
的实际单位；static Scale/SJT 与实际结果一致为 score。新增 native V1/V2 真实 trial 和
认知 ms/400 次长转义单位，200 次 METRIC 引用均比较实际渲染字节与预算，4/4 通过。
暂停严格策略、撤销 sourceGrant 和严格检查后不再弱重读的 3 个定向合同通过；
原件 `review-metric-policy.json` 7/7。4 MB 是**解密后累计报告 JSON 字节**预算，
不是峰值内存上限；原 codec 每字段解压限仍保留。

native 并发案例证明一份 raw/结果可靠持久化、重复回执和父 FINAL 重放，
不证明并发 prepare 总共只执行一次 CPU 计分，也不是全协议或浏览器覆盖。
旧测试撤权后 in-flight 继续仅记录旧行为，不能冒称政策 22 已完成。

## A：政策 22 的 Survey 消费者实现

采集防线现在覆盖所有 Survey 工具，沿用既有父对象与精确版本/授权/策略锁：
新准入、在途恢复、task 刺激交付、checkpoint 读写、父 FINAL，以及 native/认知子任务
准备与 commit 事务均 fresh 检查。新冻结来源保存原 sourceGrantId；旧冻结来源只沿
不可变 draft→原授权 FK 校验，不搜索新 grant/版本。不缓存“未停用”。
标准批准组合撤下、治理版本撤下、整包撤权/到期、sourceGrant 撤权、entry pause /
RETURNED 均阻止后续采集。Library 按 use→tool grant 原锁顺序核对。保存数据不删除，
已完成 FINAL 的幂等回执及历史报告现有读权/开放检查不扩大；历史报告停止范围仍未决定。
管理文案同步说明停止后续采集，审计 policy 不再声称仅影响未来导入。

实际合成 PG：native V1/V2 撤下后，新参与、未启动 child、在途 child FINAL、task、
checkpoint 恢复/保存、父 FINAL 均拒绝；没有部分 FINAL/raw 写入，STARTED 保留，
此前完成回执/报告不变。2/2 通过（`22-native-stop-postgres.json`）。
另外 1 项独立范围/锁测试：研究者 A 的授权撤销不影响同工具研究者 B；A 已存 child raw
保留、不能生成 parent FINAL；B 正常完成；真实 pg_stat_activity 确认 revoke 等待采集
SHARE 锁，提交后新校验拒绝，已完成回执可重放（`22-grant-scope-lock-postgres.json`）。

这不是 Training 撤权语义完成：Training 公库 wrapper 被不同教师共享，现有 Scale guard
仅带 scaleId，必须绑定实际发布者/使用授权，不能为一个教师的 revoke 插入全局 stop。
21 的 Training 显式入口准入和 22 的 Training 精确使用范围是下一片的依赖。

受影响消费者首轮 32 通过，4 个旧 cognitive lifecycle mock 缺 main 已新增 native 锁
集合而失败；仅添加空 native 夹具，不跳过 authority/锁，四项单独复验，原失败保留。
证据 `22-stop-consumers{,-retry}.json`；原始类型检查 `backend-types-stop.log` 退出 0。

### B 第三批：响应局部复用与工作台按需统计

精确采用旧 c1f5465071aa29b8652f6885d4cf99608bcfefaf 和
 e0dd43000e059b0e5732b82274330489cfade58e 的两个完整局部 diff；未合并分支。
main31d9e4cb→25215 的三个 overview 生产文件及 shared SJT response 未变；
本分支 native service 的 policy22 改动在不同函数，patch check 成功且锁/准入仍保留。
SJT assignment 同次 response 只推导一次；prepare 验证 frozen Flow prefix 时不构造
会被丢弃的 public DTO，commit/replay 仍完成两边原有权威检查，不声称并发只计分一次。
TrainingTrainerOverview 显式 includeCourseCounts=false；默认 API 仍返回课程统计，
页面无课程总数时不伪造 0，授权和 pending assignment 查询不变。

实际受影响后端四组 41/41、前端 overview 11/11 通过：
`B-response-overview.json`、`B-overview-ui.json`。未产生新容量或普遍提速结论。

## A：运行时表分类遗漏（父对话确认的部署阻断）

补匿名参与编号迁移的两份 raw-SQL 表：anonymous_study_codes 和
anonymous_study_participation_events。按现有政策最窄的可写类别 RUNTIME_RW 显式列名；
codes 需 SELECT/INSERT/UPDATE（绑定、重置、禁用未认领编号），events 需追加审计。
与现有审计表一致，原 triggers 保持禁止删除 codes、修改已认领身份以及 UPDATE/DELETE
审计事件；没有新增通配 GRANT、TRUNCATE、owner/超级用户能力或取消未知表 fail-closed。
没有改生产角色或执行生产 ACL。

本任务新合成库有当前全部 229 迁移和 260 张真实 public 表，实际 catalog 与完整政策
精确相等。新建 NOSUPERUSER/NOBYPASSRLS 临时登录角色，旧政策在原 defaults.sql
实际重现 P0001 / UNCLASSIFIED_RUNTIME_TABLE；新政策初始化和完整 privileges/schema
核验通过。用真正受限角色读写 codes、追加 events，原不可变操作均被 trigger 拒绝。
新增一份临时未知表后 defaults.sql 仍拒绝，且该角色没有该表 SELECT/INSERT 权限。
三项定向断言通过（`runtime-policy-full-schema.json`），只清理本测试的临时 DDL/角色，
合成业务审计保留；本轮不是用 owner 冒充运行时业务权限证明。
