# 验证记录与未完成项

- 固定base：`adad907a4b68606ce71bb1a4f2d7c511c872c715`。
- 实际检查内容提交：`23fbab029e587620e759a410adcde82b2b20886c`。其后只追加此记录及 validation.json，没有改变source、索引、schema、计分、依赖或工具输入；不重复已通过检查。
- 改动范围：10个新目录source.json及其数据wrapper、自动生成索引、`docs/scale-intake/seeq-20261102`。旧source、runtime、权限、依赖、workflow均未修改。主要验证位置为本环境，预计数秒；无前后端构建、无全量测试、无DB、无生产连接。

已通过：

1. `npm run scale:instruments:check --prefix server-version/backend`，退出0；生成索引一致。
2. 36个位置连续、36个唯一定位ID、原题号11/12/13各出现两次；8量表+2无分候选计数与source一致；C/P/R均为空、无executable和施测指导。
3. 10项逐一使用原生 `readSelectedSource`（精确Git blob/AST）与 `checkSelectedSource` 检查，schema/source契约有效。原生注册表全部可找到，全部没有executable。`previewScaleInstrument`逐一返回 `allowActivation=false`，原生 `planScaleInstrumentInstall`逐一在读取任何DB属性前以不可执行错误拒绝。实际输出见 `validation.json`。这不是实际隔离库导入成功，也不是正式CI。
4. 文案静态审阅：高校学生/教师可见条件分别声明；两种接收者均有正常/低体验/证据不足样例；无分表单不生成分数；无改分、无常模、无教师排名、无个体敏感反馈对教师新增披露。

本地完整轻量CLI未通过（仅运行一次，退出1）：

```
SCALE_INTAKE_BASE_SHA=adad907a4b68606ce71bb1a4f2d7c511c872c715 \
SCALE_INTAKE_HEAD_SHA=23fbab029e587620e759a410adcde82b2b20886c \
node --import tsx scripts/scale-intake-selected-check.ts
```

首错：`BUILTIN_SCALE_STATIC_UNRESOLVED_USE_BROADER_CONTENT_LANE:server-version/backend/src/modules/assessment-bundle/bundles/child-chexi-observer-zh-cn-v1.ts:factory-shape`，来自 `checkSelectedBuiltinDependencies`。该未改文件的静态工厂形状无法被当前checker解析；失败在全局内建组合依赖扫描，未声称其不受影响扫描已成功。没有修改checker、扩展CI或启动全平台验收。随后只针对本候选做可回读的导入/预览诊断，输出单独标明 `SCOPED_DIAGNOSTIC_PASSED_NOT_FULL_INTAKE_CLI`；不能用它替代正式检查结果。

CI未激活：仓库AGENTS要求先读[CI常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)。当前Notion fetch在提供link_id后返回 `Unknown tool({"name":"notion.fetch"})`，未读到页面。此为连接工具不可用，不是权限审批拒绝、不是CI失败，也未向Notion写入内容。Draft提交含 `[skip ci]`，不自行运行workflow_dispatch。后续激活前需恢复清单读取、审阅精确base/head/tree与轻量route；既有本地CLI错误仍须定位后定向处理，不能把更宽泛全量路线作为默认替代。

尚未完成：公开题文/数字施测授权、精确题本计分手册与反应格式、独立施测证据、生产/管理员自建排重、可作答包、C/P/R冻结、真实学生/教师报告渲染、隔离库实际导入、CI成功。开发库未入、生产未入，无合并、无部署。管理员后续动作详见README。
