# PR404 main 对齐及正式接纳准备

当前本批先合入 main `8cf07bfd35702222e279cbfeee2f64d73a938b55`，合并提交
`b4c1fcf3bb07d47b40026b43de43693fc4e7d224`。PR408 的 Training 增量没有混入。
只复用既有 onboarding-structure 证据接纳/CodeQL/稳定 merge gate，不新增 workflow 或 job。
原 group-report Draft 预检不能作为 Ready 资格；旧 41015176962 亦不证明新 merge 树通过。

原有 81 个 backend、2 个 frontend、2 个 HTTP/PG、1 个 SQL 事件对照、1 个宽 Form case
按保留原件和源变化审阅接纳，不重跑。前端/PG 的原部分失败及成功 continuation 均保留；
0-pass setup/超时记录仍保留在上级目录，不冒充成功报告。数据来源关联是执行后保存的
commit/WIP 审阅，未签名，不宣称原运行已与完整 Git tree 或 node_modules 密码学绑定。

本次缺失检查：

- 当前 backend/frontend 组件重新编译各一次，实际 argv、Node、开始/结束、组件 tree、
  before/after 与明确 exit0 见 types.json/exit。准备时两个 wrapper 同时调用 git write-tree，
  frontend 在 compiler 启动前遇 index.lock；改为顺序冻结 index、只读绑定后首次执行 compiler。
  没有删除锁、覆盖其他工作树或重跑已完成 backend 编译。
- 在两个全新自建 loopback `_test_` 库中，main 260 迁移实际成功，再仅应用
  `20261030160000_reporting_task_artifacts`。原生 PostgreSQL 16.15 custom dump/restore 完成，
  dump 只含 schema、迁移账本、一个合成用户及无答卷的合成加密 artifact；原件留 /tmp，不上传 dump。
- 首次 native case 因 runner --root 不会改变 cwd，找不到 Prisma CLI，在迁移候选前失败；
  修 helper 的明确 cwd 后续行，没有重建或重跑 main 迁移。
- 第二次已实际升级/完成 dump/restore，随后全 schema 文本相等断言失败。
  原生 restore 会格式化四条既有 CHECK 的 AND 括号，另有随机 restrict token；差异原件保留。
  它们不在本次 schema 改动内。检查范围收回新增 task artifact 表、索引/FK/trigger，
  不写泛化 SQL 归一化、不修改旧约束、也不重放已完成 dump/restore。
- 仅续验已恢复库的新表 schema 相等、原 artifact 解密与来源一致、immutable 触发器仍拒绝修改：
  **1 PASS**，见 native-continuation.json / native.json。
  receipt 明确 `nativeRestorePerformedThisInvocation=false` / `retainedNativeRestoreContinued=true`，
  不将续行报告冒称第二次重新恢复。

本次当前合并代码没有再构建应用镜像/整个平台或跑计分、所有权限矩阵、全浏览器套件。
旧 SQL 46/8 仍只是 N=2 合成 SQL 事件（含事务），不是生产性能或容量承诺。
新的两个 binding/gate 合同只在正式 CI 的既有 admission job 首次运行；不是业务测试重播。
实际 CI run/merge SHA/Ready 结果以 GitHub 后续回读为准；此目录本身不是 CI 成功。
