# 与 main dc0f 的交界核对

远端 main 重新核对为 `dc0f46ba506d51d42c5bb379059df82f18860b72`，已从此前
`e65d8722` 合入任务 2 的 PR #388 和 main observation 修正 #391。Task1 原 head
`117f19ce4` 经正常 merge 到 `fe5cd70eac53feb16fb2544245748a9148cdf6cf`，无冲突。
没有 cherry-pick 大认知候选或被拒 DOT 工程树，也未替 Task2 改 Bundle 引擎。

相关新 main 差异：Bundle/EVC 独立实验候选、原生 Survey 发布/FINAL/保存反馈、
教育资源/个人报告 native adapter，以及 composite/unified finalizer 的 native
Bundle 分支；另有对应 UI 与有界 CI 控制。它们不是认知任务 experience/research
授权实现，不把 Bundle 模型 profile 当作 cognitive profile 或新 testType。
本轮未启动这些上游 CI，也没有运行 Task2 素材或科学计算。

AGENTS、release 规则、Prisma schema 和锁定依赖未变；Task1 自有授权/管理文件
未发生 merge 冲突。当前迁移仍是 main 253 加 Task1 两个 SQL-only 迁移（入口
约束及审计索引），合计 255。已锁定生成 client 的 schema 仅有 Prisma 格式/属性
排列差异：对隔离副本运行原 Prisma format 后，与当前/主干 schema 完全相同。
未重新生成 client、安装依赖或修改原 schema。原尝试直接使用未安装的
`@prisma/internals` 只报模块缺失；之后使用已有 CLI，未引入包。

针对新消费者做四项保存结果回读，而非重放已合格的授权/START/FINAL：

- Training：真实受限角色经已有 HTTP 读取 revision 7 的完整冻结报告；当前 use
  已是 9，原 attempt/T3/use 读取前后不变。
- Survey：原 capability 经公开 HTTP 读取已完成结果；原 use REVOKED、R 空值，
  仍为 GENERAL_ONLY，无 native Bundle 升级，原 publication/T1/FINAL 不变。
- School：保留的实际完成 execution 及原 pin 可读，学生报告仍 READY；撤权后
  的原等待草稿没有新 attempt。
- Teacher：原完成 execution 仍 COMPLETION_ONLY / WITHHELD，未扩大为学生
  报告受众；原 source binding 与历史私人版本保持。

首次教育回读中 School 在 30 秒处超时，Teacher 已通过；保留原失败，先回查
2 parents/4 private versions/4 unit snapshots、没有其他活动连接。模块加载移到
有界 setup 单独计时（不修改业务或其 30 秒上限），只续跑 School：初始化
6815.6ms，保存来源/反馈 174.1ms，通过；Teacher 不重跑。原超时尚未归因到某个
具体初始化步骤，不能称已证明生产启动性能或 p95。最终后端交界闭包和前端 app
类型检查均退出 0。

[raw](main-dc0f-integration-raw.json) 保留原失败、过滤、命令/时间、schema 核对及
回读记录；[verification](main-dc0f-integration-verification.json) 列精确来源和边界。
较早的页面产物与权限证据仍属于其原 SHA，没有改称在此次新 main 执行。
当前合并源码的最终生产编译/正式 CI、性能对照和 cognitive profile 四入口仍待
完成；没有生产、真实用户授权、Task1 main 合并或部署声明。
