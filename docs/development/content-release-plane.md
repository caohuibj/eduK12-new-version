# 内容发布

内容检查和发布使用同一套声明。当前接入 Scale、Cognitive、SJT、Form 和 Bundle。上线依赖已经合入并获取的官方 `main`、合格的 ops 镜像和既有部署身份。

## 检查一个工具

在 `server-version/backend` 运行以下命令。一个调用可以传多个明确的工具标识。

```bash
npm run content:check -- scale:who5 cognitive:gonogo sjt:cpj-cj01-sd-baseline form:demographics_v1 bundle:adult_bedtime_sleep_zh_cn
```

## 发布清单

各家族新建的 `releases.json` 使用 `schemaVersion: 1`、与目录一致的 `toolKey` 和 `releases`。每条声明以 `releaseKey` 标识版本，使用 `allowedEntries` 指定已支持的产品入口，用 `state` 控制上线。家族特有的版本绑定和审阅字段见下文。既有 Scale 清单可继续省略 `schemaVersion`，以兼容旧版 Scale 部署工具。

| 状态 | 同步行为 |
| --- | --- |
| `ONLINE` | 允许发布声明指定的冻结版本。若填写 `replaces`，自动撤下同一工具内被替换的历史版本。 |
| `HOLD` | 单独使用时保留当前部署状态。若该版本被生效的新版替换，则仍随替换撤下。 |
| `WITHDRAWN` | 停止该版本接收新作答，保留冻结版本和在途作答。 |
| `RETIRED` | Bundle 专用的终止状态。 |

`replaces` 引用同一清单中的 `releaseKey`。循环替换和未知历史键会被拒绝。Scale 的首个 Git 发布仍可引用 `<C>/default`。回退时将新版设为 `WITHDRAWN`，上一版保持 `ONLINE`。已合入的版本文件和发布键都要保留。检查结果用 `effectiveState` 显示替换后的生效状态，后台独立授权和紧急暂停继续按各产品规则执行。

## 家族声明

Scale 维持独立冻结的题本 C、参数 P 和报告 R。仅改阈值或报告时追加对应版本文件，在 `releases.json` 选择准确的版本和入口。已有 Scale 流程及素材校验见[标准量表导入与优化](scale-content-workflow.md)。

Cognitive 的 `modules/cognitive/tasks/<task>/` 可在 `parameters/` 和 `reports/` 追加 P/R 版本，使用 `releases.json` 选择已登记的引擎、计分版本与入口。P 绑定引擎与计分实现，R 选择精确 P；引擎 fixture 随已部署的 ops 镜像维护。新增任务、交互、刺激与算法沿用代码评审和镜像发布。撤下旧选择保留既有作答，后台紧急暂停继续优先。平台管理员可从已上线的精确配置复制报告，预览四类受众的实际可见内容，完成 MFA 后保存新版。新版继续复用原测量版本，入口和对象授权需要沿用独立审批。

SJT 当前上线的 `allowedEntries` 为 `["SURVEY"]`。在 `modules/situational/instruments/<toolKey>/` 保存 `<C>/content.json`、`parameters/<P>.json`、`reports/<R>.json` 和 `releases.json`。检查编译精确 C/P/R 并运行已声明的 golden cases。媒体只声明既有资产标识，发布事务校验内容摘要和使用范围。早期 `instrument.json` 仍可只读检查，保持原发布状态。当前新增路径接入 Survey 已支持的静态图文作答和研究报告。平台管理员可在 SJT 治理中导入既有 Excel 工作簿，填写报告和入口范围，预览后经 MFA 提交审核。工作簿仍按原规则校验计分和 golden cases。仅改报告时沿用原 C/P。

Form 的标准模板使用 C/R，`allowedEntries` 为 `["SURVEY"]`。官方模板在 `modules/form/templates/<toolKey>/` 维护题本、报告和控制文件。代表性作答案例覆盖结构与条件显示，并验证冻结的报告。管理员可在 Survey 的平台治理中导入文本、CSV 或 Excel，预览后提交审核，也可复制已冻结版本仅修改报告。`demographics_v1` 示例保持 `HOLD`。Survey 的简单组合包可勾选精确已发布版本、编写 PackageReport，并按原审核与试算流程发布。

Bundle 在 `modules/assessment-bundle/packages/<toolKey>/` 内使用 `releases.json` 管理状态。原版本目录中的规则、报告、证据、上下文及四组 fixture 仍作为同一不可变包校验。检查输出给出每个版本的 `contentHash` 和试算数量。没有控制文件的 Bundle 不参加 Git 发布。

- Bundle 的 `releaseKey` 等于版本目录名，`allowedEntries` 为 `["SURVEY"]`。每条声明还要提供 `contentHash`。标记为 `ONLINE` 时，提供 `review.contentHash` 和逐项 `review.claims`，用摘要绑定已审阅的结论。
- Git 同步只管理其发布的版本。手工撤下会继续生效。Bundle 依赖的精确子工具版本须已上线，已有的使用权和发布权限继续单独管理。

## 同步已合入的声明

```bash
bash "$U" content --entry "$ENTRY" --ops-overlay "$OPS" --content-main-sha "$MAIN_SHA" --apply
```

省略 `--apply` 只显示计划。脚本从已获取的官方 `origin/main` 精确提交导出受支持的普通文件，以只读目录交给不可变 ops 镜像。Scale、Cognitive、SJT、Form 和 Bundle 在同一事务写入，出错一并回滚。作答仍使用入场时冻结的版本。旧 ops 镜像继续使用 `--scale-main-sha` 的 Scale 同步方式。

上线时仅按对应版本、服务就绪和一条受影响短流程复核。控制文件里的发布状态、具体对象的授权和报告披露各自执行原有权限边界。
