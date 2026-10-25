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
| B 兼容整合 | 依赖 A；逐提交盘点 e0dd4300 的 receipt-only、请求内 runtime、窄状态、outbox、报告单读、认知 metadata、overview | 9a1cc142 / 39784cfe / b969c94d 已逐片整合约定的兼容局部 diff，保留新的立即停止检查；未整体合并 |
| C 新基线 | 依赖实际整合 source/config；普通、native mixed、整包报告，进程冷/热分别记录 | 28d9889f 新小型探针完成，三组各进程首份/后续份两样本；非 DB 冷态、非完整容量基线，旧原件不覆盖 |
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

收尾再次枚举全部 workflow 的实际自动事件：仅 `ci.yml` 与独立
`situational-publication.yml` 接本 PR opened/synchronize；没有 pull_request_target。
其余自动 push 都限 main 或各自固定专用分支。本候选不适用旧 PR354 的精确接纳范围；
默认 draft legacy 路线会进入 35 分钟 pr-light-backend，因此最终证据提交用
`[skip ci]` 创建仅供 review 的 draft，并在创建后检查真实 Actions 状态，不触发无关
全量。独立 pull_request_review 事件不会因此被跳过，后续 reviewer 提交 review 时
应重新核对。没有改 workflow/required gate；skip/pending 不是通过，也不具备合并资格。
未签发本地到 Actions 的新接纳机制，不把本地检查伪装成官方 CI。

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

## A：05–07 父审查确认的预览竞态与真实入口

GovernedToolsWorkspace 预览以 exact source ref + 独立 request generation 绑定，来源 B
可以替换在途 A；A 的成功/失败/finally 都不能写入 B。family、来源/目录翻页、搜索变更
和卸载均使旧预览失效；读取/提交阶段禁用相关控件，缺当前来源的预览不能提交。
6 个 race/recovery UI 合同通过：A 延迟→选 B→A 返回，提交只含 B 参数/指标；
三种范围切换、旧 WavePackagePicker 失败/finally 和已 ACK 导入只重试交接。

实际 SurveyProjectTools 新增显式“从授权整包添加”，按需加载当前目录，接原本已存在的
onBeforeSelect/问卷 epoch 防线，import ACK 后按完整 bindings 原序更新当前问卷和
共享工具列表；不会再让使用者进 legacyOnly 编制页寻找目录。普通库流程不变。
真实 SurveyApp `/workspace?project=p1&section=publish` 路由合同验证按 CSRF API 适配
导入一次、页面显示两份固定组件、波次保存 instrumentIds=[a,b]；没有 mock 掉
SurveyProjectTools/Builder/ResearchPackageCatalog。此为 DOM+合成 HTTP 响应合同，
不称真实浏览器或后台授权闭环。

WavePackagePicker 加精确版本/短摘要、组件明细、到期/暂停等当前摘要；后台只读窄
DTO，不取 executable/template。旧项目的 catch/finally 也受 epoch 保护，空页仍可
继续 hasMore。列表明确只是当前授权/版本摘要，完整组件准入由动作 fresh 核对。
新增到期 ACTIVE UI 1 项通过；metadata PG 实际导入/暂停/所有者隐匿 404 通过。

本片 UI 新合同 7+1，现有消费者 33 首轮通过，另一个未改的 completion UI 首轮在
并行检查时超过原 5 秒，未放宽超时；仅该 case 独立复验 1/1。metadata 首轮夹具在
复用库遇 1.1.0 config 唯一约束，无断言执行；新 schema-only 库中 grant 例通过，
新例只因预期 403 与既有隐匿 404 不符失败；修正为原 404、仅此例在新合成库通过。
源失败/超时证据均保留，未删除其他测试数据。改变的前端文件 lint 0 error / 4 warning。

额外执行 policy22 的整包真实生命周期及必要创建前置，共 10/10 通过：FORM/SJT/
cognitive 批准组合、真实 compiler 冻结、child/parent/report，再撤权拒绝在途 FINAL，
旧报告与不可变保护保留。原“FINAL 不查 package gate”断言改为必须查 exact parent，
而不是把旧性能目标覆盖已批准的立即停止政策。

原件：`05-07-race-journey.json`、`05-07-wave-expiry-ui.json`、
`05-07-route-consumers{,-timeout-retry}.json`、
`05-07-imported-metadata-postgres{,-empty,-retry}.json`、
`22-package-lifecycle-postgres.json`。前端类型首轮只发现测试库不支持 getByRole exact
选项；删除该无效选项后类型单列复验，不重跑已通过的业务断言。

## A：标准来源指纹不能包含 JavaScript scorer 函数

实际 SDQ teacher 1.0.0 注册项的 plugin.scorer 是函数，main 的目录/策略审批直接
canonicalHash(source) 会抛错。提取并复用原 axis-snapshot 的显式 plugin key/version
投影，其余题目、计分、报告、参考、权利和版本仍在严格 canonical 闭包。目录与审批
调用同一个 standardPolicyIdentity。不是 JSON.stringify 静默丢函数，没有改 canonical
encoder 或删除工具；未知函数字段及缺 scorer 版本仍拒绝。
无插件来源原有指纹不变；所有已安装 executable 的 axis snapshot 哈希也保持原样，
standard triplet Reference 复用相同投影，避免不同摘要规则。

真实 HTTP + 合成 PG 同目录读取 SDQ 与新审批的原创共享量表；目录给出的指纹可用于
真实策略审批，改 fingerprint 或选择不存在的精确版本均 409。纯合同验证 plugin/
scoring/report 版本、题目、权利、reference 改变会改变闭包，严格 encoder 仍拒绝原函数。
首轮新夹具存在括号语法和缺 project.id，无业务断言通过；修夹具后 10 项通过，
另补既有 axis bytes 不变 1 项单列验证。原件 `standard-fingerprint{,-fixed-fixtures,-axis}.json`。
策略审计同时明确“停止后续采集、保留已保存数据”，不再用可能误解为允许在途继续的字段。

## A：已 ACK 导入与草稿选择、只读刷新分阶段

ResearchPackageCatalog 分别记忆“导入已保存”“选择已应用”“等待刷新”。外层实际
ProjectTools 将选择回调与共享列表 changed 分开；刷新失败后只调用 list.load，不再
调用 onSelected/onBeforeSelect，也不再次增加 mutation revision。故重试不会把包重新
移动到末尾或清空后来编辑的 Flow/配额。重试文案明确“重新读取工具列表”。

三项 UI 通过（`05-07-refresh-phases.json`）：目录只有一份 import、选择只应用一次，
实际 SurveyWaveStudio 在 ACK→读取失败后改为 [b,a]、设置 Flow 与 quota=7，重试后保存
仍是这些值；实际顶层路由正常交接保持通过。后续新批准的原子整包编辑会阻止新拆包，
本案例保留为旧损坏草稿恢复期间不被只读刷新覆盖的证据。

## A：governed SCALE 使用范围入口接线

GovernedToolLibrary 在原有 family 筛选中补 SCALE；沿用同一个后台准入/策略操作，
不增加内容、参数、报告编辑能力或新目录。1 项 UI 合同验证管理员选择 SCALE 后
看到已上线精确版本、仅提交其 policy identity/version；真实 PG 的独立 native Scale
案例验证系统批准→入口管理员可列出→精确 entry policy→授权和冻结，普通研究者
目录读取/策略操作均拒绝。证据 `atomic-package-ui-retry.json` 的 SCALE case 与
`atomic-membership-scale-postgres.json` 的 native Scale case；另一个 membership case
属于下一片，不能将同一次报告误称为都只测试此入口。

## A/E：整包按导入实例原子编排

用户另行批准的编辑约束按 importId 实施：同工具/同版本/同标题的两次导入仍是两个
编排单元。当前问卷内容列表与实际 Flow 共用纯编排计划，整包整体移动、整体移除，
组件展开只读显示批准顺序与精确版本。普通工具可以位于包外或两包之间，不能插入包内；
不更改授权、计分、版本、发布或服务端最终校验。

已选 draftIds（最多 30 个）通过 project-scoped package-memberships 获取完整相关
membership 摘要，不依赖目录第一页。只读查询保留当前研究者/项目权限；摘要不带
executable、报告正文或 technicalGrantIds，不作为准入凭证。真实合成 PG 新建 26 份
同版本导入，首份/末份精确选中返回两个独立 importId，普通入口管理员不能读取其他
研究者项目（保持原隐匿 404）。同批 native Scale 路径属于上节单独一项证据。

不完整、倒序、外部工具插入的旧草稿先显示原序列；只有使用者显式“恢复完整整包及
批准顺序”才补回成员，或显式从本波次移除整包。保持其他工具、embedded data、配额
和原 block 身份；失效授权仍显示阻塞，修复顺序不恢复权限。已有无条件 MATERIAL
仍合法；若移动/修复会跨材料或结束块，计划拒绝并保留原草稿，提示先明确材料位置，
不静默搬动或删掉材料。条件跳过、END、experiment 的包内限制与后端一致。

已 ACK 导入三阶段继续保留。刷新失败后可以编辑新的合法整包顺序和 Flow；只读重试
不再应用选择、不再重置 Flow/配额。新增实际 WaveStudio DOM 合同覆盖两个相同版本
实例、失效损坏草稿、原子移动、只读成员、拒绝实验、保留无条件材料/配额；顶层
SurveyApp 的真实组件路由交接合同也通过。不是浏览器或真实后台 UI 验收。

执行原件（均 maxWorkers=1，不重跑不受影响全矩阵）：

- `atomic-package-ui.json`：11 项纯计划 + 1 顶层路由通过，1 新 DOM 夹具误写“材料正文”
  而失败；改为实际“素材正文”，仅该 DOM case 在 `atomic-package-ui-retry.json` 通过。
  retry 的另一个 SCALE case 单独归入上一节，不混加为原子编排覆盖。
- `atomic-broken-flow.json`：补 1 项损坏 Flow 可编辑静态数据、不能进一步插题的合同通过。
- `atomic-membership-scale-postgres.json`：26 份 membership 与 native Scale 各 1 项通过。
- `atomic-consumers.json`：41 项旧 Wave/Flow 消费者通过，刷新 case 只因未等待异步
  membership 读取而失败；显式等待后仅该例在 `atomic-refresh-retry.json` 通过。
- `atomic-last-consumers.json`：实际工作台请求合同与旧 picker 消费者 27 项通过。

命令为 frontend `npx vitest run <以上报告列出的精确测试文件> --maxWorkers=1
--reporter=json --outputFile=<独立证据文件>`；后端 selected membership case 在全新
schema-only 合成库单列运行对应 governed-list PG 文件的精确 testNamePattern。
失败原件不覆盖；通过计数是每次 invocation，不可把 retry 相加当独立全量覆盖。

本片完成后的 backend `npx tsc --noEmit`、frontend
`npx tsc -p tsconfig.app.json --noEmit` 均真实退出 0（生产类型，不冒充构建或 CI）。
日志与明确退出码分别保留为 `*-types-atomic-final.log` / `.exit`。
最终受影响前端文件 eslint 退出 0，0 error / 3 warning（epoch cleanup 两条与原有
publicationId effect dependency 一条），没有关规则或降低阈值。

## C：整合后新的小型正确性/资源探针

独立源码 `28d9889f7078cafe97254950fb5d7ed768b12a50`，tree
`24e08a96cbf77902f45f07ce0992d83e1dcde3da`。Node 24.21.0，精确依赖锁和三个
探针源码 SHA-256 均记入[原始数值投影](evidence/survey-governance-followup-20261025/resource-probe.json)。
后台产品路径须与该 HEAD 相等；新工具在当时尚未 commit，单独记录其 hash，
不伪称整个当前 Git tree 已经在那次运行。

只有本任务两个 loopback 容器：PG 16.15 / Redis 7.4.11；全新命名合成库实际应用
当前全部 229 迁移。独立 runtime login 的 superuser/createdb/createrole/replication/
bypassrls 全 false、拥有 public 业务表 0；业务/夹具均用该角色，见
[环境投影](evidence/survey-governance-followup-20261025/resource-environment.json)。
没有生产迁移、复制数据或 owner 业务权限替代。

三组分别新起 API 进程，每组同一 publication 做两份实际作答（PROCESS_FIRST /
PROCESS_WARM），无隐藏 warmup。普通 20-choice FORM 12 次 HTTP；FORM + native
staged SJT V2 18 次；整包 FORM/native + field/metric report 20 次。真实来源经独立
author/reviewer、治理三 case trial、入口 policy、精确授权和冻结链；参与用实际
Origin/凭证/知情同意，报告用真实 researcher router/current session/MFA timestamp/
项目权限。会话合成签发，不是真人登录、MFA 或浏览器。总 6 份，50 次 HTTP，全部
200/code0，整体退出 0；每份确认 parent FINAL 唯一、原 row hash 不变、receiptId
精确重放，native child receipt 丢响应读取一致，整包报告权威 metric=5。

以下仅列每份 parent FINAL 的原始点值，完整每请求 SQL 类别、DB 协议字节、进程
CPU/内存、HTTP 正文字节、锁事务上界与存储字段见 JSON，**没有因果优化对照**：

| 工作量 | 样本 | FINAL ms | 进程 CPU ms | DB 下行 bytes | SQL events | FINAL / 包报告 cipher bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 普通 FORM | 进程首份 | 52.55 | 59.02 | 10,621 | 23 | 1,116 / 0 |
| 普通 FORM | 同进程后续 | 28.21 | 25.00 | 9,674 | 23 | 1,116 / 0 |
| native 混合 | 进程首份 | 99.27 | 87.66 | 72,497 | 35 | 6,686 / 0 |
| native 混合 | 同进程后续 | 60.50 | 50.51 | 70,690 | 35 | 6,686 / 0 |
| 整包报告 | 进程首份 | 92.52 | 86.21 | 118,234 | 46 | 6,786 / 1,376 |
| 整包报告 | 同进程后续 | 84.53 | 72.57 | 118,234 | 46 | 6,786 / 1,376 |

DB 缓存可能已由夹具加热，不能叫冷 DB；进程 CPU 含本地 HTTP driver，不是服务端
独占 CPU；query event duration 不是 DB CPU。5ms RSS 采样与进程 lifetime max 均
记录，但不是精确请求独占内存。首锁至事务结束是含等待的上界；关系 allocation
delta 含 heap/index/TOAST 页面，已有页容纳新行时可能为零，不是单行存储大小。
上表 cipher 只覆盖 FINAL/包报告，不冒充 native 原件与所有行的完整存储成本。
test 模式跳过普通 Redis/IP 限流；不是公网、生产总开销、容量或所有协议基线，
不计算冷热均值、不和 d01/31d9 不同功能工作量作提速比较，不据此加索引。

两次手工启动分别被诊断脚本错误拦住（Prisma Date 的严格 canonical 投影、统计列名），
此前 launcher 路径拼写错误未产生夹具。修的是探针，不改业务/编码器；各次独立目录
和部分原件保留，见[失败索引](evidence/survey-governance-followup-20261025/resource-failures.json)。
工具不自动重试、不创建/迁移/清空库、不上传任何请求/凭据/答案/报告正文，复用说明
见 `server-version/scripts/performance/survey-governance-probe/README.md`。
最终探针 TS（仅两个独立文件，非全量 backend 再编译）与 launcher `node --check`
均退出 0；harness 三份 hash 与提交前文件逐一一致，六样本/50 请求/全部状态核对通过。

## 可复用证据与本 PR 后续路线

[本地验证索引](evidence/survey-governance-followup-20261025/local-validation-index.json)
保存 60 次 invocation 的源 JSON digest、测试文件、实际执行 case/status 与过滤数。
不含日志、错误 stack、SQL/参数、原始头、凭据或业务正文。计数重叠，不汇总为“全套
N 项通过”；未做密码学执行认证，不等于完整输入闭包、正式 CI 或生产资格。

本 PR 的 A 正确性/交接缺陷、B 选定兼容整合与 D 已证明低风险片已有独立提交及
局部证据；C 完成小探针而非完整新容量基线；E 仅有上述纯编辑 next-plan。以下保持
同一条依赖路线，**没有把已批准 21/23/24 标回未决，也没有宣告整个路线完成**：

1. **21/Training 与 22/Training**：先落精确 release/hash 的 TRAINING 入口准入，
   沿 `scale-library-governance/authority.ts`、`distribution.ts`、`usage.ts` 分开正式
   entry admin 和普通精确 capability delegate；仅正式管理员免额外 distribute 能力。
   当前 Training 只有全局 ACTIVE/兼容声明和每人能力，不存在可直接复用的独立入口
   准入记录；不可把 ACTIVE 当本入口批准。分发之后必须在真实发布/attempt 上绑定
   原教师 useGrantId/version 与发布者：`training-content-binding.ts` 当前 library
   source 只有共享 wrapper/libraryEntryId，同 wrapper 被不同教师使用。
   再在 task/prepare/commit/FINAL 的当前事务锁原 grant 并复核时钟，撤销 A 不停 B，
   保原始数据和已完成回执。不能只加全局 scale stop。必须单独补准入/在途/撤权锁
   竞态/恢复的角色矩阵，现有旧测试通过不能证明新政策完成。本 PR 未冒险加入半套。
2. **23/24 目标模型**：复用现有 measurement-content 的不可变 release/hash、
   source snapshot、批准包身份与 current content-binding；不另造 ordinary 协议。
   先将共享内容/计分参数（含阈值）/文字模板的精确引用收进批准组合，以 FK/hash
   和 scope 校验绑定发布，再让 attempt 指向该发布/组合及实际随机分配/科学上下文。
   当前 MEASUREMENT/REFERENCE/REPORT 已有版本正文，但 Reference 中可能有完整来源
   证据，且 Form/整包尚未全部使用相同正文引用；不能只改字段名就声称已去复制。
   计分实现 key/version、许可/适用范围和证据仍属于批准闭包，纯文献标签的变化不
   得偷偷改变权限。无参数/无报告显式为空，不自动追新。
3. 提交沿现有权威 scorer/严格 child receipt 一次生成可追溯的原始事实、总分、维度分
   和必要质量标记，引用 scorer/批准组合；报告、分析、导出消费这些 facts，不重算。
   按需渲染复用原 generator/version，读前后保 current project/撤回/排除/revision/
   hash/模板 REVOKED/开放 fence。两入口反馈差异与 native/cognitive 原件、时序/路径
   子事实保留。当前包报告仍在 FINAL 内物化，尚未迁移成目标模型；本 PR 的预算/
   回滚保护是在此现有模型上的完整修复，不伪称已实现按需包报告。
4. 在全新隔离库直接验证目标模型，不默认旧协议永久双写/双读。现有库/旧测试版本
   实际永久清理仍要先列环境、精确 ID、全部引用/附件与必须保留基线，并取得删除
   范围确认。当前没有删除清单获批，没有删数据/历史/immutable trigger/FK。
5. 结构 14/16–19 在上述新模型上按相同协议再冻结基线；优先 request-local 有界批量
   读事实、纯 next-plan/写推进分离、共享正文一次构造。第二次 disclosure fence
   缩列必须先证明 FINAL/来源闭包不可变；祖先依赖可复用 immutable 集合，不缓存
   “未停止”。索引只凭真实 EXPLAIN+代表合成数据决定，本 PR 没有新增索引。

唯一仍需用户决定的相关政策为历史报告停止范围；它不阻止当前采集立即停止修复。
25 单人系统管理员签发仍保留，School/Teacher 不自动扩展。完整目标模型属于可独立
审查的后续迁移片，不夹进当前已有证据的正确性/低风险提交。

## PR355 合并前定向收尾（审查基准 984eadcf）

按父审查此次明确的三项范围修复；开始时 HEAD/远端同为
`984eadcf22fc1b30a50a9d44a2668f35e51d0dec`，工作树干净，保留全部已有提交。
不混入 Training、共享三层正文、按需报告迁移或 main 原有的非 UTC 授权时窗问题。

1. 旧“选用本研究已加入的工具”复选区也经同一编排计划：点击一个包成员会整体选用/
   取消该 importId，并明确标示整包操作。对已移除/未选中的可见候选，打开复选区后
   只按本页未解析 draftIds 读取 membership；已选成员复用现有摘要，不再因移除后
   摘要为空而把包成员当普通工具。读取未完成/失败时保留原草稿并阻止该复选操作，
   不将摘要当准入凭证。真实 SurveyApp 路由验证取消 A→B 同时取消、再次选用 A→全包
   恢复、取消 B→整包移除，最终 PATCH 只含普通工具，原 MATERIAL/embedded data/
   quotaStarts=9 均保留；没有 mock 掉 WaveStudio、ProjectTools 或 Flow。
2. 多个残缺包允许逐包显式恢复/移除。仍未修复的其他包必须保持精确已选成员，不能
   新增问题、插入/重排更多外部工具，不能新建残缺包或拆坏原合法包。Flow 同样只
   容许原有未解问题保留，不能新增条件/END/分支问题；材料跨区歧义仍拒绝并保留原稿。
   10 项带/不带 Flow 的双残缺包恢复/移除/最终合法路径，另 1 项拒绝加重的断言，
   加实际 WaveStudio 两包逐一恢复，证明有可推进路径而非强制同时修好全部。
3. 图片 FORM 用例改查 FORM 目录，并明确断言 SCALE 目录不含该 FORM；保普通角色
   读取/精确 policy 的 403 以及共享图片冻结引用。原生 SCALE 原断言与完整冻结路径
   保留，两条路径均实际执行通过，没有用单个 SCALE 通过替代图片用例。

本轮证据在[独立索引](evidence/survey-governance-followup-20261025/premerge-validation.json)，
没有覆盖此前 60 份历史 invocation 或资源探针：

- 前端初始红例：11 失败（复选入口 1、双残缺包 10）；第一次修复 22 纯断言通过，
  1 DOM 夹具错误地要求保存后仍显示已移除工具而失败。保原页面筛选规则，改为保存
  前验证重新选用，再取消另一成员并核对保存，最终 25 项（23 纯计划 + 2 实际页面）通过。
- PG 首轮图片 FORM 在错误 family 断言失败；native SCALE 因命令漏设本地发布功能
  标志，止步既有发布前置。原件保留；在另一新 schema-only 合成库明确 test 配置后，
  图片 FORM 和 native SCALE 两条完整路径 2/2 通过。没有修改数据库时区、权限或
  业务开关默认值。该次只选两项，其他 19 项过滤，不能称全 suite 通过。
- 直接消费者 37/37：SurveyWorkspace.requests、SurveyWaveStudio.content、
  SurveyPackageJourney、SurveyPackageRefresh、SurveyFlowStudio。前端测试命令均
  `npx vitest run <上述精确文件> --maxWorkers=1 --reporter=json --outputFile=<独立原件>`。
- `npx tsc -p tsconfig.app.json --noEmit` 退出 0；本轮两个生产文件与三个前端测试的
  eslint 退出 0、0 error / 1 既有 publicationId effect dependency warning。
  后端只修改测试断言，生产模块/schema/依赖不变，不重复旧 backend 类型和资源探针。

原始失败、夹具修订与绿色输入文件 hash 分开记录；不是正式 CI、整应用构建、真实
浏览器或非 UTC 风险修复。此次提交保 `[skip ci]`，只更新既有 draft PR355，并在
push 后检查没有新 Actions/check；不改 workflow/required checks、不合并、不部署。

## PR355 正常合并资格推进（后续明确授权）

用户后续明确要求完成必要 CI 后合并，并澄清此前“不扩展压力测试”限制的是本地
版本验收/性能分析，不禁止仓库正常门禁的 GitHub-hosted 隔离 200 完成检查与短 k6
smoke。不部署，不改生产/现有部署负载，不追加容量实验；不扩展到下一阶段开发。

PR355 已转 ready；main 仍为 25215dcc，产品审查 head bab8e3de。新增无产品 diff 的
`896bf9276eafedadbb4d301fb69cac2b114778fa` 正常 synchronize，去掉 HEAD 的 skip 指令，
没有重写历史或手工 dispatch 代替 PR 检查。实际采用原 legacy/platform/C 全部门禁。
GitHub integration 读取 main 分支保护返回 403，未换身份/路线重试；仍可核对 PR、
review threads、实际检查和仓库 merge gate，绝不强制跳过。

首轮[主 CI 40159337918](https://github.com/caohuibj/eduK12-new-version/actions/runs/40159337918)
与[独立 Situational 40159337789](https://github.com/caohuibj/eduK12-new-version/actions/runs/40159337789)
均对应 896bf927。独立 publication 已成功，主 CI 暴露两个此前在精确路线中未执行的
主干验证消费者缺口：

- scope 的 136 项中 135 通过，content-workflows 的 test-only 路由断言失败；backend
  的 content routing 子集也因同一项失败，不能把两次当两个新根因。断言硬编码 scenario
  必须在 if 文本开头，但 PR354 在前面加了更强的 exact-route 排除。工作流条件未改；
  测试现在执行完整的既有布尔条件，遍历 event/draft/force/frontend 组合，确认 test-only
  始终拒绝、普通 platform 至少有真实可达上下文，不再把前缀位置当准入证明。
- 前端 typecheck 在 pretypecheck 的生成清单检查退出，尚未执行该 job 的 tsc。
  App.tsx/OrganizationProductRoutes.tsx 与 main 相同，确定性清单漏掉的是主干已有的
  3 条系统管理员路由。仅按原生成器从 156 刷新到 159 条；没有改路由、权限或生成器。

两处局部修订的主要验证：仅原失败 Node case 1/1，159 路由 inventory --check、
6 session/2 syntax gate 验证及其 3 项 Node 断言通过；未重复本地全矩阵。
首轮官方生产前端构建、UI-lab 构建、两生产镜像构建/扫描已成功；其余结果由该原 run
保留。失败仍是失败，不能将这些成功子项拼成完整资格。后续修订必须在实际最终 head
走原必需门禁，当前文档不签发本地/跨提交自动接纳，不改 workflow/required checks。
最终合并和后续 main 检查以 PR355 的实时检查及合并结果为准，不将本段首轮记录
伪装成最终成功。

### 首轮结束后的实际阻断与定向归因

官方 backend regression artifact `12586341016`（ZIP SHA-256
`6d14a9a01bce7ee188ec05075df300568cdf918bb56fb8fe8d5b628a8ebfdb1f`）已逐字节核验。
该 job 实际 930 文件/8060 断言通过，84 文件/203 断言失败，33 文件/236 断言跳过；
全量命令排除了另一个 job 承担的 aggregate burst。不能把这次结果称为通过，也不能
把所有失败归因于 PR355。

在同一云端增加只读 detached main checkout（不是替代环境/任务），固定 25215dcc，
复用相同锁定依赖与 Prisma schema，只选官方已失败的用例进行因果对照：两批纯用例
49+36 项，以及全新 schema-only 合成库的三个 PG 用例，共 88 项；main 同样失败
86 项，2 项通过。没有跑第二套本地全量，没有修改 main 的源文件、时区、权限或
真实/现有授权。三个 PG 对照分别实际重现入口管理员身份缺失、系统管理员不能代替
Training 分配、以及未显式发布测量版本不能冻结，不能通过放宽这些规则修测试。
另 115 个正式失败断言及所有 suite setup 错误尚未完成逐项归因，不伪称都是基线问题。

两项 main 能通过的样本分别为：

- SJT public-projection 单元用例受本 PR 新增 fresh 采集边界影响。仅在该测试显式
  模拟事务/采集边界，断言调用一次并增加 authority 拒绝时不得返回投影的负例。
  整文件 12/12 通过；生产 guard、真实 PG/锁负例不改，不借其他请求/数据库授权。
- streaming ZIP 背压行数用例：CI 生成行数超过原 300 行，main 与候选各自定向本地执行
  通过。该生产文件/测试原样，阈值未放宽；两个局部点不能当容量、普遍提速或已完成
  CI 资格，也不能单凭此确定 CI 失败的全部环境原因。

CodeQL job 121067458499 在既有 20 分钟上限被取消；日志记录到 87/89 query evaluation，
没有完整分析/上传结果，不能标成功或将部分查询当 SAST 资格。另有 14 个缺必需数据库
变量的 suite setup（含本 PR 的 SURVEY_FOLLOWUP_TEST_DATABASE_URL）；隔离保护保持
fail-closed，没有改 skip、退回任意 DATABASE_URL、借共享/真实库或伪造 Actions 身份。

详见[首轮官方诊断与定向 main 对照](evidence/survey-governance-followup-20261025/merge-ci-first-diagnostic.json)。
其中只含 reporter digest、静态 case/status、失败文件和配置名，没有原始日志/凭据/正文。
源码/夹具修正先 push 备份并保留 skip 指令，避免已知外部阻断未处理时重复启动全平台。
继续合并需要明确允许的验证维护范围：CI 独立库接线与 SAST 时间预算，以及已确认
主干旧夹具/契约的维护。现有“工作流不变”边界仍保留，未擅自修改工作流或压低门禁；
在实际最终 head 必需检查真实通过前，PR355 不合并。


## PR355 验证维护授权后的当前批次

用户已在本任务明确批准“允许验证维护，保持门禁和业务权限不变”，并要求细致归因、集中修订后再运行下一轮正式 CI，通过后正常合并。上节“尚待工作流维护授权”是当时的历史阻塞，已解除。

最小 CI 改动：backend-regression 的缺失专用数据库 URL 只接到该 job 自己的 PostgreSQL 服务；补真实 runner 环境身份，使已有隔离判断可以辨识该服务。CodeQL 的 20 分钟上限提高到 30 分钟，保留原语言、查询、安全选项和范围；首轮在 87/89 query evaluation 被取消是预算依据。backend job 仍保留原 35 分钟预算。没有降低 required checks 或扫描断言，没有授权部署。

`6c9745fd` 已单独保存 Zod 4 下可编辑空白私有 Scale 的修复；空数组草稿保留，冻结继续调用完整原生验证。首个受影响合成 PG 批次 41 通过、3 失败，后者是旧媒体授权夹具的 SYSTEM_ADMIN 代分配假设；原始报告及摘要分开保留。后续维护继续使用正式入口管理员和精确能力，不放宽产品权限。

其他已定位修订包括：COMPLETION_BUSY 优先交统一重试响应，先于普通编码繁忙分支；Zod 4 错误对象采用独立新夹具，原有历史错误和成功 hash 原件保留；新鲜权威元数据的 mock 必须完整；测量先显式发布、已发布草稿先显式创建修订；被不可变审计触发器保护的合成记录不强行删除，由整个一次性测试库生命周期回收。

仍逐项核对原首轮 203 个失败与 suite setup 失败，不因 main 同样失败而忽略。未完成归因及受影响验证前，不盲目重复平台全量 CI。整包新建认知实例缺发布指针的主干产品缺口已单独请求最小接线范围确认；此前只批准验证维护，不据此自动混入下一批 Training 范围政策或模型迁移。


用户随后明确批准整包认知实例的最小发布接线。修订只在现有整包显式发布事务中，为缺少指针的当前认知副本调用 `publishAssignmentMeasurementRelease`。现有配置授权先检查，已有指针继续由原整包发布验证；不自动追新，不改变准入范围。新增真实 PG 用例覆盖非所有者拒绝、发布末端 SQL 故障后认知发布/父状态一并回滚、原冻结配置与当前配置均不被改写、成功后单一发布及旧修订重复操作拒绝。

验证维护边界保持：原 203 个失败及 22 个 setup 失败为排错输入；新增测试只验证本批修复、隔离服务和报告并集控制。报告合并是两次互不重叠的执行，不是重试结果拼接；保留两个原始 JSON，任何失败或缺少报告仍失败，出口消费者必须实际无跳过通过。该消费者使用同 job 真实 Redis 服务的独立 DB15、实际容器 ID/镜像与过期标记，和原 full regression 的 Redis DB0 分离，避免暂停/清理队列干扰其他功能测试。


### CI 后原生精确授权修订（本任务候选，未进 main）

`assertSurveyPublicationNotPaused` 对 unfinished collection 同事务 fresh 检查原始 SJT 的 pinned entry capability；仍逐一检查 recipient tool grant，不替换为较新许可。同请求只复用已经验证的完全相同 receipt；新请求重新验证。FINAL 重放与历史报告已有单独门禁，此片不扩大历史报告禁读范围，不删保存事实。图片发布匹配同时绑定本 PR 编译器加入的 `sourceGrantId`，保留无此字段的旧冻结身份比较；同正文的替代 grant 不能借用。

局部原生单元 26 项通过；真实隔离 PG 的 V1、带图、variant、source-capability 和 bundle-content 本次 15 项通过，另一个 lifecycle setup 变量笔误在独立修订中处理。逐断言与原失败摘要见 `native-ci-maintenance.json`。新治理授权与历史已存授权测试明确区分：带图来源尚缺原作者 governed-media 授意的提交路径，COURSE_GRANT 来源的系统提交者也不能代替精确入口分发者；保留拒绝，不假称支持新授权闭环。历史夹具只在明确隔离合成库写入 pre-governance storage contract，不是生产 API 兼容通道或正式批准。


### 下一次正式 CI 输入收口

用户已明确允许验证维护（门禁与业务权限不变），以及整包认知复制实例使用既有发布函数的最小产品接线。候选已分片备份 `6c9745fd`（Zod4 草稿）、`f7b6c766`（同事务认知发布）、`036a4400`（busy/quota/同请求 option table）、`a12741c5`（原生 pinned authority/media）、`645164f3`（夹具/契约）。这些都是本分支候选，不称已进 main。

原始 CI 203 条失败的逐项证据账本见 `ci-validation-maintenance.json`：198 条同名断言或明确改名合同已有后续局部通过；5 条待真实 Actions（Mini 两条、Survey rollback publication 三条）。这不是一次全量 198/203 成绩；每次失败、过滤和 setup 拒绝原件均保留。新增数据库配置所覆盖的 8 个文件 47 条实跑全过；匿名研究清理修订 4 条实跑全过。Mac export 的真实服务身份正例只由下一轮 Actions 执行，未伪造本地 CI 身份；本地 Mini exact UTC 守卫拒绝 setup，不修改数据库时区。

CI 最小配置：9 个显式 opt-in 指向现有 job PG（14 个 suite 使用），增加缺失/异库一次性预检；保串行与全部原始保护。导出消费者独立进程/同 job Redis DB15，验证真实 container ID、image 与 expiring run marker；保 base/export 两份原 JSON，并要求不相交完整并集成功，失败不变绿。回归原35分钟预算不变。CodeQL只将20分钟上限提高至30分钟，原查询集/语言/路径不变。控制单元18过、路由84过，YAML及四段Node语法通过；生产 backend tsc 退出0。

普通 synchronize 触发下一轮全部适用正式门禁（含隔离 200 完成与短 k6 smoke），没有借用 PR354 或其他固定候选路线，也没有降低 required。正常最终 head 全部必需检查成功、无其他阻断才合并。此片完成后不自动部署或开始下一阶段迁移。


`b59e6af5` 的 GitHub workflow validation 在创建应用作业前拒绝：job-level env 不支持 runner.environment。原失败 runs 40166657738/40166660581 保留，不能称回归已执行。已将该值移入两个实际消费 step env，增加 job/step 层级合同；官方 actionlint 1.7.12 经官方 checksum 核验，两个 workflow 的 expression/semantic 检查退出0，18项控制仍全过。无应用输入变化，不重复本地应用测试；下一次正常 synchronize 执行缺失正式检查。


### 9065 正式失败后的冻结检查点（等待父 dot 第二轮复查）

当前优先级仅为收敛 #355；不混入 #356 的 Training 范围绑定、共享版本引用或按需报告迁移。用户已要求双重复查：修复和局部自检后冻结精确 HEAD/tree/diff，父 dot 独立确认该候选才可启动下一轮 CI。9065 的运行创建于该要求之前；之后仅使用 `[skip ci]` 备份，未手动 dispatch/re-run。

[正式 run 40166806895](https://github.com/caohuibj/eduK12-new-version/actions/runs/40166806895) **整体失败**，精确 head `9065bb0ee73916d5e35f913b389f2ea55a9f0818`，测试 merge `af94aaadccdd52a1d7c7b33c2ff0aca5845c19f8`。后端原始报告8399通过、3断言失败、227跳过，另1套件setup错误；不可继续称旧203为当前失败数。CodeQL、生产镜像扫描、前端/UI-lab产物、后端迁移/构建/200完成门、短k6、维护/恢复门、seeded security均已真实success。完整选中作业身份见 `official-ci-9065-outcomes.json`，成功子项不能把整体或未来head变成成功。

| 正式失败组 | 修订与现有合同 | 定向证据/边界 |
| --- | --- | --- |
| Mini功能清单 | 原生成器145→159条，来源是真实路由；不改native能力或业务权限 | `feature-inventory.cjs --check`通过；无删除路由 |
| 前端typecheck | 独立前端job补后端锁文件 `npm ci --ignore-scripts` 和显式 `prisma generate` | 干净后端依赖目录 app+cognitive两份tsc退出0，共享表单4项通过；不启动后端/迁移/seed/服务，不编译canvas |
| Mixed native setup / report conflict两例 | 固定gonogo版本和全局FIFO必须使用各自空合成库；新库完整执行现有229迁移，真实Prisma绑定/恢复。Cognitive显式走原发布函数 | 2文件4项实际通过，保版本/FAILED/attempts=2/budget=0/拒绝重试原断言；原共享库的DRAFT、队列及数据不修改 |
| ZIP背压 | 用户已明确批准 `fd531f11` 将Archiver中间队列1MiB默认收紧到64KiB | 原10项及backend tsc通过；300是行数上限，非300ms；不改断言、权限、保存格式，不声称普遍提速或峰值内存上限 |
| QA Round3 | 按真实折叠区、article状态badge、报告方案视图修订流程，保作者不能自审及独立审核/发布 | 原脚本完整6个检查通过，无page errors |
| 三引擎共用视觉脚本 | 练习新术语、分页query fixture与完整提交计数 | Chromium有界局部：提交页3视口；编辑/媒体选择360/1440，原焦点/键盘/取消/溢出断言保留。三引擎完整选择未本地重跑 |
| SJT父入口/导航共因 | 用当前正式「情境判断测评」「已作答/未作答」，同步剩余直接消费者及FinalCompositeShell合同 | 真实API foundation、video原脚本ALL PASS；FinalCompositeShell2项通过。其他同词消费者只语法/同源合同核对，待正常CI |
| MEDIA2 | 旧PUBLIC字段不足，复用既有真实测量发布和精确PUBLIC分发许可夹具 | 独立量表/登录包/匿名包3条真实API浏览器路径ALL PASS |
| Bundle发布 | 截图明确是CONTENT_STATIC_SJT_MAPPING_MISSING；原status selector有效。夹具补真实Scale/Cognitive/static-SJT发布前置及Training课程 | 专用原有fixture server有界验证创建/发布和通用PATCH409通过；没有声称完整参与/报告浏览器流程通过 |

`RUNNER_ENVIRONMENT` 的多余覆盖已全部删除，读取Actions原生值。官方 actionlint1.7.12检查三个受影响workflow退出0，18项控制通过；生成清单和CJS语法通过。根因映射、原始失败/局部失败与最终结果摘要见 `ci-9065-repair-candidate.json`；原JSON/日志仅保留私有，公开证据只含身份、hash和断言状态。

浏览器复用本轮官方前端/UI-lab及backend产物，核ZIP摘要和原manifest的source/run/kind/lock/content；不重复构建。测试只用新建合成库与loopback端口，未改数据库时区、生产角色或数据。专用Bundle fixture server按既有测试路线运行源代码provider，和普通编译产物探针分清。旧失败、错配本地fixture profile、未运行/过滤项目均保留，不将有界probe标成完整CI。

本检查点之后仍需父 dot 对精确候选独立复查并明确同意，再运行最终head全部适用门禁；不得借用9065成功子项伪造新head门禁成功，不force merge、不绕过保护、不部署。

### b376 正式 CI 后的前端合同收口（尚未获下一轮 CI 资格）

父 dot 已复查并批准 `8c1475665d0f98d98062ed19d1bb9f3303f37d50`，tree
`40412665e1bddeb5a68ece8cf24c9d63ec26afc0`。仅以同 tree 的空提交
`b3760a4b73c1307952279346bc392ed5eaeacdd7` 正常触发
[run 40170212567](https://github.com/caohuibj/eduK12-new-version/actions/runs/40170212567)。
原测试 checkout 为 `665c3eef0516e6255403139c5dceb9af398fbb9d`，整体 **failure**。

本轮后端回归 job121099427715 真正 success：主组8401通过，独立导出3通过，
合计8404通过、0失败、225跳过。原JSON官方artifact12590114361已回读并核验ZIP
SHA256 `f737a82ffe3a71538dc839108cabed8cd29eea9ecbedd4c481387c4e30b9b563`。
CodeQL、生产镜像扫描、前端及UI-lab构建也success；独立Situational run40170212455
success。以上不把其他失败或未来head变成通过。

分类和backend routing boundary共用的旧断言把整个frontend job中的
`npm ci --ignore-scripts`一概拒绝，误中了新增backend类型依赖步骤。
`41c58d17`仅修这项直接消费者：frontend仍必须在自身目录执行完整`npm ci`；
唯一backend准备步骤精确限制为锁文件安装和Prisma生成，不能启动应用、迁移、seed
或native build。分类与backend直接使用的16文件140项合同全部通过。

前端本轮首次越过typecheck后，完整运行实际为26文件失败/522通过，53项失败、
3630通过、3跳过。当前25个测试文件的修订覆盖其中52项失败：

- 真实AuthProvider、STANDARD及精确release委托夹具；保会话拒绝、产品匹配和普通
  角色拒绝。Survey使用当前专用管理API，其他入口保原范围；不伪造系统审批。
- Teacher分区和Training课程handoff按现有导航；旧测评保存退出后才能打开另一项。
  复用仍验证来源所有者、独立目标课程、不带历史提交/成绩/匿名凭据。
- 等待真实lazy编辑器/报告控件；认知恢复等待新的父ID及`current-unit`请求，保旧
  凭据清理、禁止重启子任务、过期本地草稿保护。无新增生产恢复逻辑。
- 传输层测试提供局部jsdom Image.decode夹具，不改真正解码门；按需附件还需显式
  点单个素材预览。保Blob路由、撤回、迟到响应及禁止跨入口回退断言。
- Survey普通问卷夹具补membership响应；复选操作等待读取完成，换波次显式确认
  放弃草稿。固定版本按当前分离标题DOM定位，Form提示对齐现行治理准入。

受影响25文件155项合跑全部通过、无跳过；最后两文件查询参数类型修订后5项再次
通过。app/cognitive两份tsc、相关lint和diff检查通过。原首次局部路径拼接错误
（0项执行）、中间局部失败和三处ByRole参数类型错误均保留原日志，未声称通过。

剩余1项是School刷新待办未清除旧反馈的原产品断言。新增最小产品修改已经询问
范围确认，尚未获答；原断言不删不改，生产代码尚未动。分类失败导致本轮下游
browser/media/三引擎/维护/性能等选中项未执行，仍须正式成功。
本次不修改工作流或权限、不启动新CI，最终候选仍需父 dot 再次复查。
精确job、失败项及验证映射见`ci-b376-repair-candidate.json`；原始日志与报告仅存
任务私有证据目录，公开记录不含会话、连接字符串或真实数据。
