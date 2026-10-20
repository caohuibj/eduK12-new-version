# Training C22 + C23 源码集成检查点

## 范围与不可变来源

本轮只集成已审查源码、必要测试适配与证据说明。集成目录复用原 C22 worktree，没有复制源码树或 node_modules；新分支为 `work/training-c22-c23-integration-20261019`。原 C22 分支保持在 `5f2e956b4ef12f21a0d4114ebdefbfb58887c213`，原 C23 分支保持在 `55a00c686a4a86cac9fe7de570be25f4748bec1d`，原 stash 不动，无 GC。

修改组件 → C23 前端原子恢复/过期处理、资格 harness、共享准入测试 → 避免恢复混入旧答案、同 attempt 静默重做、非法 Prisma 字段和集成丢失反馈保护 → 当前云端定向 mock/no-emit，复用精确输入一致的原证据 → 不执行数据库、emit、安装、CI、PR、合并或生产操作。C24 在最终独立复核后另行开始。

| 集成批次 | 来源 | 结果 |
| --- | --- | --- |
| UI/恢复 | `cc6a1661c1174e5ae261f86f5146048c49c7e409`、`648886cab8b62ac7977477add971fa0cb3c20198`、`d4cfe6f0717401873482bcb75ce97e1b8e9c4842` | `8586cb9f4eaba5c69b110f3e7a5bf31e3ce29dca`，12 文件 |
| C23 harness 原样保留 | `ef3f7f2b6183e3475237608bd51551b58679bd75`、`362471a0b9d11495447089a5a449ff9fb33787f2`、`8fa754eee078d1551ce625b3aa6e6955fbd1b8c7`、`83621ccee3b3d552cfb7539781f603c7b8ef7011` | `9dab911bad390c764dabdd254a63249212b5f991`，14 文件 |
| 共享准入测试适配 | `83496451e8715c3d4aed74a446ad0e451b5f952a` 的 13 个场景，以及 `fd1a568e7c4a97d030935f8c8e8e035617b90e8d` 的 typed/schema 保护断言 | `cbece4bcd17e307de6985ef642eafda34ae265f1`，2 文件 |
| C23 历史资格记录 | `55a00c686a4a86cac9fe7de570be25f4748bec1d` | 保留独立 C23 的准确范围，不改称集成资格 |

没有再次接入 `213c35ff` 或 `fd1a568e` 的业务块。前者已由 C22 的 `86d85667` 包含，后者的非法 select 已在 C22 的 `19dad8b6` 修正。集成继续使用 C22 的 feedback-or-persistence 分支、`configuredPolicySelect satisfies Prisma.CompositeAssessmentSelect` 和局部 typed delegate；保留运行时 LEGACY 拒绝、缺省 FINAL_ONLY、publication 锁、状态/窗口、课程/教师资格、学员授权及冻结身份。后端业务、schema、migration、依赖声明与原 C22 `5f2e956b` 不变。

## UI 与存储证据

12 个接入文件逐字匹配固定 C23 `55a00c68`。Form/Scale 恢复以完整答案集合和 timing 元数据进行 Memory/IndexedDB 原子替换，事务内重查身份与封存状态；整卷缺任一单元拒绝，提交完成后才发布 UI/ref。认知 TTL 过期保留父测评恢复入口及 pending 防护，不把同 attempt 自动当成新作答。

- 本轮受影响 no-emit：438 个 source files，0 diagnostics，0 emitted files。12 个文件与对应 C23 源码闭包比较仅有两个 `types.ts` 差异，转译 JS 相同；测试配置及已核对的关键依赖 realpath 一致。记录在 `c22-c23-integration-ui-types-01.log`。这不是完整安装依赖清单证明，也不是浏览器证据。
- `c23-recovery-validation/validation-receipt.json` 原始记录为 Memory 21 通过、3 个 IDB-only 跳过，模拟 IndexedDB 24 通过，原消费者 36 通过。仅对其中仍相同的存储/恢复输入复用；36 项消费者结果保持历史范围，不称后来修改的 FinalCompositeAssessment 在最终输入整套复验。模拟使用官方 scratch-only fake-indexeddb 6.2.6，不能替代 native IndexedDB。
- 后续父恢复分支使用 `cognitive-expiry/parent-recovery-tests-final.log` 的 2 文件 10 通过；expiry 修正使用 `expiry-tests-final.log` 的 2 文件 6 通过、8 未选。不同选集及重叠结果不相加；早期恢复 receipt 不能单独覆盖后来变化的 FinalCompositeAssessment 分支。
- 原 `cognitive-expiry/tests.log` 的 31 通过/1 失败保留。native Chromium IndexedDB 在测试前因 process-singleton Unix socket EPERM 退出，exit 1、tests 0；不绕过、不改绿。原 lint 中已记录的 react-refresh/Hook warnings 保留。

上述旧证据位于本轮工作根或 `/workspace/shared/c23-recovery-20261019`。仅复用适用输入，不把历史单测汇总改写成一次新的完整运行。

## Harness 与准入测试

14 个 harness 文件及完整 Git recovery helper tree 与 C23 `55a00c68` 相同。未运行 launcher、preflight、服务或数据库。README 的“只允许 C23 migration over accepted C21”限制原样保留；该 harness 不能原封不动用于含 C22 的 schema，也不能通过放宽 migration/旧行 whitelist 获得资格。

`c22-c23-integration-harness-reuse-01.log` 记录相同源码与旧 receipt 的逐字核对：terminal 的 6 项故障测试和 helper-mutation 的 1 项输入仍精确匹配。较早 4 项 Python 故障检查之后，http/test 文件又变化，因此仅保留其历史检查结果，不称最终输入全套通过。更早未保存的初期 raw logs 仍缺失，不用口头计数补证据。

共享准入的新测试仅适配 C22 已存在的紧凑 header 两个反馈字段和实际错误文案；fixture 明确 feedback=null，保留 checkpoint-only、local-cognitive-only、both、off、三种 LEGACY、锁后状态/窗口/课程与权限丢失共 13 场景。调用真实 `startUserAttempt`、按生成 Prisma DMMF 校验 select，并在实际 insert 边界截获数据；不宣称完成真实数据库事务。新增 AST 断言把 schema 约束绑定到实际使用的 select 变量和 typed reader，保护 feedback-or-persistence 分支与不含 deliveryMode 的真实 DB 投影。

本轮在共享 measurement lock 内使用 Node 24.21.0 / TypeScript 5.9.3，新/变化断言 14 通过、9 未选；受影响两测试加既有全局 augmentation 根文件的 no-emit 为 1215 sources、0 diagnostics、0 emitted files。输入前后 SHA-256 相同，阶段耗时约 6.3 / 18.3 秒；最低采样 free 9,455,747,072 B、MemAvailable 6,475,665,408 B。只证明资源保护线未触发，不是连续极值或性能比较。未变化的 C22 服务、反馈、模板、历史与权限测试继续引用原限定证据，不重复全套。

### 本轮新增证据索引

路径相对于云端工作根 `/workspace/scratch/5a77e8bdc1ae`；原始日志与小型 receipt 留在证据目录，不将依赖文件、源码快照、凭据或数据库加入 Git。

| 证据 | SHA-256 |
| --- | --- |
| `c22-c23-integration-ui-types-01.log` | `0b61fcad06408c88bc077e0606e3bcb8c12cc006598828c877e99a441801060d` |
| `c22-c23-integration-harness-reuse-01.log` | `3d7317de4251f5330d6e044b248a043dab57fab1d1f6b75dd40d6ea6520ce46a` |
| `c22-c23-integration-validation-01/selected-tests.log` | `1896922291af0305c80762eb3f8ed79d7c409d96793a1ee3e9329767c6713b50` |
| `c22-c23-integration-validation-01/affected-types.log` | `010a0b53fc4ca096dcf978e2a5c04b12b4c33f68726f5ca578019c8f80af8041` |
| `c22-c23-integration-validation-01/receipt.json` | `3a106bb10cd88e97a622e419b77883a297929139985285604f66c8f1795a2b62` |
| `c22-c23-integration-validation-01/type-inputs.json` | `719591c1137cec29649405d7905a433fe0711bd7226a64d67d3669e8191a445d` |

## 历史证据不可变与未完成边界

原 `c22-final-manifest-20261019.json`、`-02.json`、`-03.json` 保持原字节。`-03.json` SHA-256 为 `16b2a1c01d55975bbc283e6683bf2afbaf12d39c5acc67b294d6ce4c3dbc4eef`，绑定原 C22 `5f2e956b`。其中旧 C22 绝对源码路径已不再表示 current HEAD；复核旧来源应按固定 SHA 的 Git blob 或原备份读取，不更新旧 manifest 去迎合新目录内容。

[C22 原限定证据](training-feedback-c22.md) 保留独立发现的历史反馈绕过、模板生命周期回归和非法字段，以及各自修复 SHA。原最小合成 PG run overall FAILED、43 项 SQL 部分通过；单独 Node/integrity continuation 7 项通过，不将原失败改绿，不称完整平台 migration/restore。原 mock、环境配置失败与修正后定向结果均保留。

[C23 独立资格记录](../recovery/training-20261018/progress.md) 保留 HTTP01/02 失败和 HTTP03 在 `83621cce` 的真实完整本地合成 PASS。该结果属于 C23 over C21，不能直接证明 C22+C23 的联合 migration、反馈 HTTP、权限全链或恢复。其 accepted HTTP03 源与原始证据保留，作为后续授权后的联合升级基线。

后续依赖顺序：

1. 完成当前定向检查、不可变备份与独立源码/证据复核，再开始 C24。
2. C24 限定普通 Training 页面：已确认的错误焦点、原生键盘附件/上传控件、可访问名称/label、实际验证的触控与换行问题，复用现有纸色/深绿变量。保护 focused 测评及认知刺激/时序，不引入宽泛共享样式，不碰 Mac Survey。
3. Inbox 的 `resultAvailability='REPORT'` 为非泄漏文案一致性问题，可在 C24 将入口改为中性“查看测评状态/报告”。保留完成回执、计数、链接和服务器事实；不为标签新增查询、频繁轮询或客户端开放时钟。真正结果页仍是权限/开放状态权威。
4. C25 在独立授权和预算下，基于保留的 accepted C23 HTTP03 新副本，审查仅增 C22 的联合升级/恢复方案，生成与集成 schema 对应的产物/client，并补受影响真实 HTTP/教师与学员权限/下载及四工具交付出口。不能把 C23-only launcher 的旧 whitelist 直接扩成任意 migration。浏览器/native IndexedDB、C19 suppressed 直接断言、长 CSV 数字单元格及选定视频等既有缺项按固定输入选取，不默认重跑所有已通过项。
5. C26 的 CPU/内存/负载测量独立，当前源码接入、单测或 no-emit 不支持性能改善结论。
