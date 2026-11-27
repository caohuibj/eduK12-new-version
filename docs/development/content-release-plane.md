# 内容发布

内容检查和发布使用同一套声明。当前接入 Scale 和 Bundle。上线依赖已经合入并获取的官方 `main`、合格的 ops 镜像和既有部署身份。

## 检查一个工具

在 `server-version/backend` 运行以下命令。一个调用可以传多个明确的工具标识。

```bash
npm run content:check -- scale:who5 bundle:adult_bedtime_sleep_zh_cn
```

Scale 维持独立冻结的题本 C、参数 P 和报告 R。仅改阈值或报告时追加对应版本文件，在 `releases.json` 选择准确的版本和入口。已有 Scale 流程及素材校验见[标准量表导入与优化](scale-content-workflow.md)。

Bundle 在 `modules/assessment-bundle/packages/<toolKey>/` 内使用 `releases.json` 管理状态。原版本目录中的规则、报告、证据、上下文及四组 fixture 仍作为同一不可变包校验。检查输出给出每个版本的 `contentHash` 和试算数量。没有控制文件的 Bundle 不参加 Git 发布。

- `schemaVersion` 使用 `1`。`releases` 的每项包含 `version`、`contentHash` 和 `status`。发布声明使用 `ONLINE`，同时提供 `review.contentHash` 和逐项 `review.claims`，用摘要绑定已审阅的结论。
- 替换版使用 `replaces` 指向应同时转为 `HOLD` 的前版。回退时在同一文件把替换版转为 `HOLD`，恢复上一版 `ONLINE`。保留版本文件。`RETIRED` 为终止状态。
- Git 同步只管理其发布的版本。手工撤下会继续生效。Bundle 依赖的精确子工具版本须已上线，已有的使用权和发布权限继续单独管理。

## 同步已合入的声明

```bash
bash "$U" content --entry "$ENTRY" --ops-overlay "$OPS" --content-main-sha "$MAIN_SHA" --apply
```

省略 `--apply` 只显示计划。脚本从已获取的官方 `origin/main` 精确提交导出受支持的普通文件，以只读目录交给不可变 ops 镜像。Scale 和 Bundle 在同一事务写入，出错一并回滚。作答仍使用入场时冻结的版本。旧 ops 镜像继续使用 `--scale-main-sha` 的 Scale 同步方式。

上线时仅按对应版本、服务就绪和一条受影响短流程复核。控制文件里的发布状态、具体对象的授权和报告披露各自执行原有权限边界。
