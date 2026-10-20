# PR318 对齐管理员 main 的审查交接（2026-10-20）

产品对齐提交为 `4f8ad3e2979fbe3a56ca09218a4df847c35c131e`，由已验分支 `38a75df66ac91b5f1e3161305d9310edf6e60ead` 无冲突合并实际远端 main `f41dca3f347b253b500de600c75855ffcd275491` 得到，并已推送独立分支备份。PR317实际合并时间05:29:36 UTC；main tree与其已通过官方CI的source `3340688ce9e0970ca4279cd385f2f8ceed55ceb6` 相同，均为 `d1c7a46d559bdbe1fc895483a7e4712af99b8cb8`。官方来源为 [run39373851559](https://github.com/caohuibj/eduK12-new-version/actions/runs/39373851559)，不改写成PR318的资格。

原Training差异相对新main仍为17路径：产品4、测试4、历史驱动2、证据说明7。本交接文档另增加1个说明路径。没有加入管理员功能、CPU/SQL新优化、依赖/schema修改、CI工具修改或压力测试；管理员实现只是通过main进入分支，不是本PR相对main的新增差异。

双方唯一文件交集为 `composite.service.ts`，main添加授权helper import，并把冻结策略首次admission的课程/创建者SQL改为 `trainingCreatorAuthoritySql`。Training物化改动在另一个函数，没有冲突或人工产品调整。相对各自基线的Training补丁stable patch-id完全一致：`b19000b1288023f014701bbf9cce8dcb4f3a8ebc`。其余三个产品文件与38a原blob一致，两个驱动也未改。

| 边界 | 本次核对 |
| --- | --- |
| 新管理员身份 | helper完整保留main的realm、active/frozen/password、expiry、显式TRAINING entry grant或已批准教师本人课程约束；没有恢复`role=ADMIN`通行。 |
| 锁与权限 | 创建parent时仍执行main课程/用户共享锁SQL；物化仍先校验作答主体、锁parent、校验当下资源使用权限，再消费当前调用中已验证candidate。没有把管理员身份或授权证明写进复用缓存。 |
| checkpoint | SAVE锁后carrier复用、GET/CLEAR投影及CAS/epoch/expiry/closure保持原补丁。 |
| frozen report | 新写compact Cognitive codec及完整定义保留，旧来源复制语义和reader不变；没有新增共享架构。 |
| main权威输入 | `.github`、依赖声明/lock、Prisma schema/migrations、admin-permissions、auth middleware及导出worker授权均与新main一致。 |

历史驱动及其数据口径固定于原测量SHA；未拿旧合成ADMIN seed去调用新main。今后如需复用驱动，必须先按当前业务身份准备fixture；本任务不做这种扩展，也不重跑已有单份。此前0ef新writer单份的时间/CPU/存储数字继续是0ef结果，不能标成新main组合的性能实测。

本次必要本地检查已经完成：

- 以main lock文件补齐独立依赖副本，所有resolved package版本与main一致；旧依赖、原始证据与所有数据库保留。已有环境代理/CA下从官方npm源下载，TLS/integrity保留；未安装新CA或修改系统信任。最初offline缓存缺包及直连超时记录保留，已解决。
- 对main schema重新生成Prisma5.22 client；后端`tsc --noEmit --incremental false`通过，39.644s。没有生成新的应用运行产物。
- 合并后的`training-flow-materialization-reuse.test.ts` 7项和`training-flow-final-admission.test.ts` 27项通过，共34/34、2文件；后者含4项源码wiring断言，其余覆盖实际函数的mock持久化边界。没有把mock当成真实PG或新管理员HTTP集成证据。
- 其余输入未变化的checkpoint/report格式和旧单份证据只复用，不重复执行。新组合的真实PG/HTTP资格仍待正式必要CI；管理员main已通过的未改来源也不冒充本PR新执行。
- 未启动数据库、Redis、API或consumer；未做负载、未运行此前未启动的两项CPU/SQL优化，未部署生产。

## 当前CI计划必须先处理的交集

在对齐SHA上以`pull_request`和准确base运行**只读分类器**，实际结果为`scenario=platform`、`application_route=legacy`、`run_performance_tests=true`、`perf_smoke=true`；两个历史functional-only marker均未作为新文件加入本PR，不能套用它们过去的固定base声明。

因此直接转ready将启动`ci-backend.yml`的200-completion性能步骤，以及phase-0性能任务，还会选择未修改的frontend/UI/media路线。这与用户暂停新增优化、禁止压测和只做必要功能门的当前范围冲突。没有设置任意环境布尔值跳过、放宽门槛或删除必要检查；没有转ready/dispatch/merge。本状态为**pending root review与必要CI范围协调**，不是失败已被当作通过。

下一步应由root审查本对齐SHA，并明确一份受限、可核验的必要功能CI计划：保留受影响后端类型/功能、管理员Training身份交集、存储旧新reader/写入/结果完整性、必要安全扫描及稳定merge gate；仅省略明确取消的性能和可证明未受影响的组件。若需要改CI路由，应单独冻结工具diff并review，不把旧functional-only marker或本地review证据伪装成已经具备官方资格。获审后才转ready；所选检查真实全绿后再merge，不自动部署生产。

原始对齐证据仅保留在 `/workspace/training-alignment-state-20261020`：`evidence/existing-ci-plan.json`、`build/aligned-types-summary.json`、`build/aligned-flow-contracts-vitest.json`及对应log/operation summary。原有性能结果没有复制或重写，相关入口见[最终单份复验](20261020-training-final-single.md)。
