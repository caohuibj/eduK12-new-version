# 同 C/P 双非空 R：正常登记与冻结消费者

2026-10-30。用户 04:55:58 UTC 的具体授权已解除本项旧阻碍。实现由当前 main 和已合入的纯素材重新编写，未读取或复制此前被拒绝的混合工程树。当前 main 基线 `40799e96f34d12047f31507ca2eba87e31fc08d3`，正常合并 checkpoint `230dcfaab5b22df95c28148f0f178ac22fec7902`；相对先前 13884d 的新增是 PR396 的纯 TALIS 来源/index，未改变本任务接口、依赖或迁移。

## 改动与来源

沿用 `scale_axis_snapshots`、STANDARD 版本/组合、原安装/seed、原审批试运行及报告消费者。显式装入三份已审阅 sidecar，不扫描目录，不新建版本库或计分器。sidecar 对精确 instrument/C/P hash 验证；正常安装保存默认与附加 R，默认 `scale.definition` 不变。注册器仅追加 REPORT 轴。系统管理页显示“标准版 / 趣味版”，趣味组合标题与编译模板标题使用同一值，各入口继续显示已有配置名称和 R 版本。

三份来源均为已推纯内容 commit `6fa885ec74ca01350db25c44bd61c700648b05d1`，与 `docs/scale-intake/materials-three-20261029/<key>/report-variants.json` 字节相同。运行时 JSON 入 Git，setup 不读取 DOT 私有文件。完整路径、SHA256、C/P hash 及来源见 [原件](registered-dual-report-raw.json) 的 `materials`。

| 工具 | C | 标准 R | 趣味 R | P |
| --- | --- | --- | --- | --- |
| CFQ-7 中文工作译稿 | 1.0.1 | 1.0.2 | 1.1.0 | 无阈值/常模 |
| IPIP C1 自我效能中文工作译稿 | 1.0.0 | 1.0.1 | 1.1.0 | 无阈值/常模 |
| BPS9 中文工作译稿 | 1.0.0 | 1.0.0 | 1.1.0 | 无阈值/常模 |

## 已执行的有限证据

- 新 PG16 数据库、现有迁移、既有 runtime ACL；实际业务身份 `precise_task1_runtime`，无超级用户、建角色或 bypass RLS 权限。正常 `seedScalePackages` 两次：三工具六份真实非空 R，DRAFT/HIDDEN，默认报告及全部轴行不变。没有 SQL 内容补丁，也不将 DRAFT 装载称为上线。
- 三工具 C/P/计分定义相同、R/hash/template 不同的纯契约 4 PASS；系统管理页新增报告标签/选择与既有显式空报告保护 2 PASS。原内容 20 个对照不重复。
- CFQ 正式安装/发布、两组合正常系统审批及其各自原有三例强制试运行 ONLINE；入口管理员分别授予两个合成成人任务创建者。标准草稿先绑定，后批准趣味版及给另一接收者授权，旧草稿来源 hash 不变。趣味接收者试用标准组合实际 403。两个组合共享同一 MEASUREMENT release，C/P hash 相同，R hash 不同。
- 两个真实匿名 GENERAL 任务发布、START、出生年月 context、7 题 FINAL，各输入同为 3。读取持久化 canonical metrics，两份均 total=21。公开报告精确读到各自不同非空 summary，未出现另一 R 的 summary；重复读取及完成另一报告后旧报告重读相同。T3 binding hash 保持。成人自我报告的教师读取仍为 UNAVAILABLE，未放开数据权限。
- 四入口只补本改动直接触达的共享 source/identity/policy 边界：两组合 × TRAINING/SURVEY/SCHOOL/TEACHER，八个正常批准策略回读。不是八条新角色端到端授权，也不是 CFQ 儿童适用性批准。既有四入口授权/运行证据保持其原范围。
- 当前后端受影响闭包类型、系统页面/测试类型各 exit 0。原完整/分阶段类型与认知 136 试次、旧 Training/Survey 链、#395 均未重跑。完整正式构建产物仍待 CI 按既有接纳机制各补一次。

## 首错、续验及边界

首轮趣味组合显示标题与编译模板标题不同，组合登记成功但授权被严格的 `REPORT_TEMPLATE_MISMATCH` 拒绝。修为同一标题，不降低校验。原合成数据库 `precise_dual_report_test_20261030` 保留且隔离，未改写已登记行；修正后另建 `precise_dual_report_test_20261030_v2` 正常 fixture。前者不能用作合格候选来源。

新库首个登记测试误把 Triplet 当 catalog projection，修正只读断言后从 checkpoint 续验，未重发批准/授权；报告测试最初误要求教师有成人自评解释权，改为既有 UNAVAILABLE；随后发现 JSON 字符串转义换行的比较错误，改为精确 interpretation 字段，只读续验已有两个 FINAL。类型首轮漏既有 Express ambient，补原 `middleware/auth.ts` roots 后通过。全部原失败、命令、时间、退出、reporter 和续验原件保留，不称首轮全绿。

证据由开发节点无签名分阶段执行，原执行没有伪造 Git SHA；最终源码关联另受精确候选绑定和独立审阅约束。公开报告确实使用两个 R，不依靠空报告或 GENERAL_ONLY 替代。旧 `SAME_CP_SECOND_REGISTERED_NONEMPTY_R_BLOCKED` 的工程/本地验收缺口由此证据替代；正式 CI/合并资格仍未取得。没有生产库、部署、真实用户授权、GitHub APPROVE 或保护修改。

## 接下来唯一正式路线

候选 source/component/control 绑定更新后先保持 `enabled=false`，自然节点交 DOT 审阅真实完成证据。按 AGENTS 要求已读取 Notion CI 常见错误清单；适用 CI-001/003/006/009/013/019/020，当前 DB opt-in、真实权限与报告恢复按上述原件处理，CI 不重播这些应用生产者。只沿既有 scope → onboarding-structure（原件接纳、缺失 backend tsc/frontend Vite 各一次）→ CodeQL → merge gate，未执行项不记通过。独立审阅后才激活精确候选，最后合并候选不使用 skip 标记。
