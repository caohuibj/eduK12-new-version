# CJX01 显式无分原生 SJT

本候选基于 `fe4ddcb88e9f4f50de08149f5bfa4929312576f0`。范围是 SJT 原生定义、冻结与 FINAL、既有独立报告卡、普通教师 SELF 组合、Survey 原生消费；不实现四模式联合报告，不修改旧 CPJ 内容或身份，不启动 CI、合并或部署。

## 可审阅内容与发布边界

- `u4-cjx01-sd@0.3.0`、`u4-cjx01-wd@0.3.0` 各为独立工具：7 个呈现节点、28 个实质选项、14 个 U/N 选项、三轮分支；每份 64 条完整路径、42 条非回答早停路径，共 106 个显式 golden。
- 每节点沿用原生 CHOICE stage，具有冻结历史身份、阶段确认及 capture 校验；U（信息不足）和 N（不愿回答）均可正常保存为 FINAL，不补成零分。
- 内容仍为 `DRAFT`，科学声明 `PILOT`（现有最低候选分类，不代表已做试测），`evidence: []`、`claimScope: null`，无实证证据或已验证主张。运行资格检查成功不等于内容审批、科学批准或生产上线。
- 正式使用仍须现有精确版本 GitHub 内容审阅、registry 发布、measurement 发布及对应产品授权。测试里的 registry publication seam 仅用于本机隔离数据库，不是实际 GitHub review，也不会改写提交内容的 DRAFT 状态。
- 教师 SELF 的独立投放、完成与报告走既有私有组合 / Run 链。普通公开学员投放继续拒绝 teacher_self_report。SD/WD 不依赖彼此或反思 Form；反思单独选用。
- 未扩展旧 `sjt-upload-v1` 作者编辑 UI；不能把原生定义直接塞入旧上传表。现阶段由 native registry 内容路径审阅发布。

## 契约

显式 `scoring.mode: UNSCORED` 仅在 V2 分支定义启用，scorerKey 为 `situational.unscored`。旧定义不补默认字段，旧冻结 hash 不因本功能改变。旧计分模式仍要求非空发布指标；canonical 结果必须完整、无重复地输出全部冻结指标。

无分模式禁止模型、choice contribution、发布指标和数字解释；本版只允许必答的非计分单选通道。测量主题标签仍是内容目录。叙述逐字引用实际选择，禁止类别比较或能力推断。结果为 `mode=UNSCORED`、`quality.status=unscored`、空 metrics、`responseStatus=COMPLETE|NONANSWER`；不伪造完成分。后者是作答事实，任务满足状态与能力效度分开。缺失路径、错路、陈旧历史、跨所有人、重放更改仍被原门禁拒绝。

编译器标记 standalone/embedded 可用、aggregateEligible=false；普通组合可保存该独立子工具的空指标快照，计分 Bundle 和认知/量表聚合拒绝 unscored。四个不同工具的结果不平均。

Measurement release 仅显式无分 SJT 可无指标，核心重新校验执行定义。Survey 只将其交给现有 staged native 协议；governed trial 检查原生回执、完整实际路径和无分叙述，不要求或制造评分。独立无分 REPORT release 只能绑定一个无分 SJT measurement，空 metricKeys、纯 TEXT；计分报告保持非空指标约束。该模板是审批声明性文字，参与者路径回顾仍来自保存的原生叙述。Survey 本轮没有增加新的参与者路径报告 UI，保留既有反馈可见性政策。

## 验证与复用边界

这是业务及共享测评运行时变化，按 release README 的 C 路线记录，不能走纯内容 CI。主要检查在本机：定义/分支/科学 gate 与 212 路径；冻结/FINAL/canonical/报告的受影响回归；隔离 PostgreSQL 的 standalone、Teacher SELF HTTP、Survey 子 FINAL 与父 FINAL；前后端 TypeScript；报告卡/导出测试。旧内容及其他平台模块不做全量复验。必要预算约 5 分钟（不含编写与故障修复）。

隔离 PostgreSQL 16.15 使用本次临时 `u4_test` 数据库及 main 对应完整 migrations；无生产数据，合成账户使用随机标识。Teacher 与 Survey fixture 遵循现有集成测试方式保留合成审计/发布事实，容器由协调者统一清理；未 truncate、未停止共用容器。发布审阅与 CI 未激活、未通过，不能以本机证据声称正式 gate 成功。

测试清单、结果和受影响文件摘要由本次交付附带的验证日志记录。复用只限完全相同源码、fixture、依赖和数据库 schema 输入；发生变化时只使相关检查失效。

### 本次已完成检查与首错

- 核心 / 消费者定向组合：13 文件 111 测试，其中 107 通过；4 个首错分别是旧 unknown-source / scientific fixture 直接取 manifest[0]（现为旧 CPJ，不能作为 V1 或旧治理修订的 oracle）及完整指标集合校验遮蔽原先未知指标的具体错误。修复为显式 golden 身份和先检查未知指标，定向 4 文件 44 测试全部通过，不改变旧内容或放松断言。
- 最后科学资格与 CJX01 contract：2 文件 29 测试通过；两变体共 212 个完整显式路径 golden 均被校验。无分模式的 modelEvidence 不得借空指标集合取得科学资格。
- 上述 13 文件组合内真实 PostgreSQL：standalone 3 测试（SD/WD 各完整、U、N，重放与越权、错路）；Teacher SELF HTTP 2 测试（两变体各独立创建/冻结/Run/FINAL/重放/反馈/撤权）；Survey 3 测试（完整、U、N，治理审批试运行、发布、子 FINAL/回执及父 FINAL）均通过。
- 首轮实际持久化检查暴露 staged capture 测试载荷遗漏、Teacher 不能进入普通学员组合（权限保持）、Survey catalog / trial / report 的旧评分假设；分别补既有 capture fixture、改用真实 Teacher SELF、增加显式无分 native 消费分支，未伪造指标。
- 前端报告卡及导出定向 2 文件 10 测试通过。后端 `tsc --noEmit`、前端 `tsc -p tsconfig.app.json --noEmit`、manifest check、`git diff --check` 通过。
- 本机 Node `24.19.0`，仓库 engines 要求 `>=24.21.0 <25`：上述为该本机环境的真实证据，不宣称已经在声明版本或正式 CI 成功。依赖来自协调者准备的隔离目录，Prisma 按基准 main 生成；没有修改 lockfile。

完整首错及修复日志位于交付附件 `sjt-implementation-evidence/`，包括 `summary.json` 的逐日志 SHA-256。无新平台全量检查。后续正式验证须按精确 base/head/tree 和这份差异范围决定缺失检查，不以 `[skip ci]` Draft 代替合并门禁。
