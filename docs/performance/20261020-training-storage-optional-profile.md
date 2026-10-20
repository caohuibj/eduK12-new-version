# Training 存储可选 profile 与 frozen report 最小修复

基线仍为实际远端 main `c3f9a7e77447c706f4a83a93c7429a7bcb164e94`。本增量以前一诊断提交 `fa34852c8692b12b237b6e2556bee175eadb602a` 为 review 起点；只改变一个产品写入位置，不修改默认环境、Compose、schema、SQL、权限、配额或调度。此前实测及其限制见 [单份存储诊断](20261020-training-storage-profile.md)。

## 推荐的独立可选配置

下面是明确选择启用时的三个运行参数，供独审后的隔离单份复验使用。本文件不被应用自动加载，也不授权生产启用。

```dotenv
ASSESSMENT_COMPACT_FACTS_ENABLED=true
ASSESSMENT_SHARED_CONTROL_ENABLED=true
ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED=true
```

API、报告及导出 consumer 应使用相同的兼容 reader、加密身份和所选存储配置。保持已核实的其它有效参数；三个 flag 不代表可以增加报告预算、并发、连接池或改变 admission/timeout。上一轮隔离环境实际为同步报告、whole=false、报告配置 600/2/50ms、pool 20/4；这不是生产或其它环境的推荐容量，也不能用历史 200/1 替代实际读取值。本增量不改这些配置。

| 参数 | 当前实现中的作用与依赖 |
| --- | --- |
| COMPACT_FACTS | 启用既有 compact facts/统一 runtime 密文写入；本增量还使新生成的 Cognitive assignment frozen report 使用既有 compact Cognitive codec。该 report 压缩本身不依赖另两个 flag。 |
| SHARED_CONTROL | 与 COMPACT_FACTS 同时为 true 才启用共享控制、小引用和 Cognitive shared runtime 写入；单开不会启用这些路径。 |
| SHARED_RUNTIME_STORAGE | 独立选择 Scale shared runtime 持久化；与前两项一起开启时得到本轮已验证的三 flag 组合。Cognitive shared runtime 由前两项控制，不由此项单独控制。 |

不顺带启用报告压缩、异步报告、whole-submit、编译/冻结缓存或 submission-priority 等其它可选配置。既有受限运行角色、shared runtime/public template/private binding 表及相应 main 迁移必须已就绪；保留原始答案、必要事实和版本身份。没有新增角色授权或迁移。

## 一处新写变化与 domain 核查

产品改动仅在 `src/modules/cognitive/profile-freeze.ts::freezeAssignmentProfile`：COMPACT_FACTS=true 时，`resolvedReportSnapshotEncrypted` 从 `encryptCognitivePayload(resolvedReport)` 切换到现成 `encryptCompactCognitivePayload(resolvedReport)`。两者都包裹完整 `{version:1,value:resolvedReport}`，使用原加密密钥和认证加密，compact codec 已有长度上限、认证 header、明文 digest 与解压限制。没有新增 codec、字段裁剪或共享架构。

小型 `resolvedConfigSnapshotEncrypted` 保持原 writer；`resolvedConfigHash` 仍先对原配置明文计算，Profile、版本和报告内容均不变。report 仍保留 participantPresentation、v2 与旧版 metric/quality/report 定义及 caveats。本增量不把科学定义改成引用，不改变 source/compiled/runtime 身份计算。

静态核查生产源代码、scripts 和 Prisma 写入后，实际新冻结入口统一经过上述函数；其余相关路径复制字段或 DTO。`freezeDataForWrite` 原样传递密文，`prepareTeacherPublishedAssignment` 的 `sourceFreeze` 和 questionnaire/bundle/composite 来源复制也不重编码。

因此只有**重新冻结定义**的新来源/新 assignment 获得新 report 格式。用旧来源创建新的 Training course wrapper，仍会复制旧 report 密文；不会自动回填、压缩旧来源或迁移历史结果。复验必须明确是否新冻结了来源，不能仅凭新 parent/新 wrapper 推断覆盖了此写入口。

| 消费位置 | 现有读取边界 |
| --- | --- |
| Cognitive public/session 配置、cognitive-analysis protocol、Composite 配置/analysis snapshot | `decryptCognitivePayload`；config 未改。配置 hash 对解密内容校验。 |
| Cognitive session/export/collection/report-rollout、`loadFrozenMeasurementContext` | `readFrozenReport` → `decryptCognitivePayload`。 |
| Training analysis、Composite service/export/analysis snapshot、统一 aggregate finalizer | 同一 `readFrozenReport`。 |
| Assignment 查找与 protocol/analysis 冻结身份 | 对 `readFrozenReport` 结果计算 hash，不比较密文字节。 |
| 来源复制、Training deferred assignment DTO | 原样复制完整冻结字段，最终仍由上述 reader 消费。 |

`decryptCognitivePayload` → `decryptField` 已无条件支持 legacy 与 `ekc1`，与写入 flag 无关。其它 `{schemaVersion:1,value}` domain 不能代替 Cognitive `{version:1,value}`；本次负例确认这种误封包被拒绝。未发现需要新增或替换的 reader。

## 依赖和回退

启用前保持既有迁移、受限角色及 shared rows 完整可读，密钥身份不变；任何备份/恢复必须保留同一个数据库时点的原始事实、共享 artifact、模板和私有绑定。本文件不执行备份、恢复、清理或生产操作。

关闭三个 flag 并以兼容版本重启相关 writer，可恢复各路径旧格式的新写行为；停止新发并让已接收的有界工作安全收尾。关闭 flag 不改写已经接收的数据，兼容 reader 继续读取新旧记录。只有关闭 SHARED_CONTROL 不能关闭本增量 report 压缩，必须同时关闭 COMPACT_FACTS；只有关闭 COMPACT_FACTS 也不能阻止独立的 Scale shared-runtime 写入，完整回退应关闭三项。

**旧 reader 如果不认识 `ekc1`/`ekr1`、facts 引用或 shared artifact，就不能直接部署到已有新格式数据的数据库上。** flag=false 不会转换现存记录。回退必须保留兼容 reader、迁移、共享记录、私有绑定及原加密身份；不能删除新表/必要事实，不能用旧数据库覆盖已经接受的 FINAL。跨不兼容 reader 的转换或恢复不在本增量范围内。

## 本增量定向验证与范围

Node 24.21.0、既有依赖，4 个受影响测试文件 **34/34 通过**：新增 codec/reader 检查 15 项、来源原样复制 2 项，其余为既有 frozen Profile/participant presentation/deferred assignment 检查。实际调用现有 writer、reader、Cognitive registry 和准备/持久化函数；数据库边界使用 mock，不冒充 PostgreSQL 集成或并发证据。

- 三个 Go/No-Go Profile 的完整 report 解密内容、配置明文/hash、Profile 定义版本一致。
- legacy/compact assignment 混读、写入开关关闭后读取、新旧来源密文跨开关原样复制。
- 改密文、改认证长度、错误密钥、错误 domain、错误 envelope version 均拒绝。
- 三 flag 组合验证 report 仅受 COMPACT_FACTS 控制，config 继续 legacy。

原始测试记录仅一份：`/workspace/training-load-followup-state-20261020/build/frozen-report-targeted-20261020-vitest.json`；对应 operation summary/log 同目录。`tsc --noEmit --incremental false` 通过，耗时 42.141 秒，summary/log 为同目录 `frozen-report-types-20261020-*`。`git diff --check` 通过。

上述源码验证阶段未构建运行产物、未发测评/导出请求、未改旧数据、未启动负载或 CI；该阶段没有新增业务时延、CPU 或存储收益结论。SJT shared artifact、CPU/SQL 优化和更大重构全部延后。父对话独审 GO 后批准的唯一新单份复验见[最终结果](20261020-training-final-single.md)；正式CI仍待管理员main合并后协调一次对齐。

## 已有 503/未知结果的只读分类

以下复用已经完成的原始 300 份历史基线分类，不代表重新执行用户已取消的方案：61 个 503 全部是 `ASSESSMENT_SUBMIT_BUSY`，与 `unit_submit` admission `reason="timeout"` 的 61 次计数对应；该 gate 有效配置 active=50、queue=128、wait=5000ms。因此是 admission 排队预算耗尽，不是已证实的 PG 事务/连接池超时。

229 个未知全部为 `TimeoutError`，对应全局 40 秒提交截止，单请求 30 秒上限触发数为 0；其中 POST FINAL 147 个、GET 82 个。147 个未知 FINAL 在后续既有只读审计中均有接受记录；61 个拒绝没有 snapshot。数据库另有 31 份完成不追记为客户端正常成功。分类原始汇总引用 `/workspace/training-load-candidate-state-20261020/evidence/baseline-outcome-explanation.json`；没有为此补跑测评。
