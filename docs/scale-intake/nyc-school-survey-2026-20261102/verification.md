# 验证、候选触发边界与续办

修改范围固定为13个NYC 2026学生版原生目录声明及JSON、现有生成索引、此目录的来源/拆分/原创报告文档。新增内容不会生成executable、运行计分、报告版本、授权或数据库行；不修改旧冻结版本、schema、引擎、依赖、CI、权限或普通组合运行器。

“修改组件 → 检查及故障 → 执行位置 → 证据 → 预算”：元数据 → AST/schema与目录可发现且不可启动检查，防止误登记成可施测工具；本云端工作树一次。索引 → 既有生成器及check，防止遗漏登记。来源 → 2026原件和编号/范围人工核对，防止套旧年或单教师化。原生只读合同几秒；未来正式纯内容轻CI约5分钟为预警，不扩到全平台。本次不启动正式CI。

| 项目 | 状态 | 实际证据与范围 |
|---|---|---|
| 官方学生题本／指南／修订说明取得 | PASS | inventory三份原PDF精确hash/字节/页数；原文不入Git |
| 13份原声明AST、source schema、checkSelectedSource | PASS | native-metadata-check.json；均CATALOG_ONLY、无schema问题、0 scoring executions |
| 原生registry读取及不可执行边界 | PASS | 同一检查中getSource存在，getExecutable/getRuntimePolicy均undefined；没有源码注入或运行分数 |
| 61题编号去重覆盖 | PASS | 同一检查验证1–61精确覆盖，不证明独立施测效度 |
| 生成索引 | PASS | 既有scale:instruments:generate一次、scale:instruments:check一次；排序导致后续import编号自然移动，不是改旧工具 |
| 静态Bundle反向依赖完整检查 | FAIL | reverse-dependency-first-error.json；未改主干CHEXI工厂形状超出现有检查器支持，保留真实首错 |
| 原生计分边界及报告运行 | NOT_RUN | 没有executable、P/R或真实回答；文案示例经过内容审阅，不冒称已渲染或已验证运行 |
| 隔离开发库导入／回读 | NOT_RUN | 现有install.ts要求executable及runtime policy；目录候选不具备，未调用DB安装/预览，不造假题补齐 |
| 生产排重、管理员自建及生产写库 | NOT_RUN | 只做源码/PR路径排重；未查生产，不声称完全无重复 |
| 正式CI／CodeQL／merge gate | NOT_RUN | 本PR提交用[skip ci]保留Draft；先交主线独立复核已知检查器首错，不制造绿灯 |
| 合并／部署／公开／分配 | NOT_RUN | 本线程不执行 |

执行Node v24.19.0。复用本环境已有backend node_modules；检查到tsx4.23.12、TypeScript5.9.3、Zod4.6.7、Prisma client5.22.0、pg8.16.3与当前lock对应项版本一致，但**未声称干净npm ci或完整依赖闭包已重建**。证据包含当前lock SHA-256和每份source SHA-256。共享依赖目录来自较早工作树，lock文件并非整个一致；没有用它伪称正式CI资格。

## 已知检查器首错

本次在已有`checkSelectedBuiltinDependencies`上检查当前built-in声明，首错为：

```
BUILTIN_SCALE_STATIC_UNRESOLVED_USE_BROADER_CONTENT_LANE:
server-version/backend/src/modules/assessment-bundle/bundles/child-chexi-observer-zh-cn-v1.ts:
factory-shape
```

错误实际为单行，此处换行只为阅读。目标工厂使用export function与导入的CHEXI_IDENTITY属性；现有静态checker在确认是否引用NYC子项之前就拒绝此形状。两份文件相对固定base的字节一致/hash在首错记录中；这证明未被本PR改写，不声称已正式完成main复现或已经修复。未弱化断言、过滤掉该文件、切更广测试或重跑完整命令。它阻碍完整selected source CLI／正式内容资格，不妨碍已完成的13份目录schema/consumer检查及来源交付。

## CI激活前的交接

已实际读取AGENTS指定Notion“CI常见错误清单”`404d27635a388186ac80de3593da05a5`。Hui连接404，使用既有Qiang连接成功只读；不是权限绕过，也未写Notion。适用CI-004（静态检查器支持边界）、CI-007（生成索引）、CI-020（base/head/tree与证据身份）；无DB/UI/浏览器/产物构建消费者，不把全清单变成必跑项目。

主线独立复核和激活决定尚未发生。本线程没有创建正式失败run，故没有CI失败回写或重试。后续若确需正式CI，由主线在核清该既有checker首错后，冻结PR所示精确base/head/tree和完整diff，沿现有content/scale-intake路线及实际所选安全检查、stable merge gate处理缺失项；不要重复已经同输入完成的本地检查，不新建资格框架，也不切全平台补绿。当前合同没有宣称本地报告已被GitHub正式接纳。

内容实际落地另需README中的来源许可、同义ID及官方冲突核清；就算检查器恢复，也不自动获得内容授权或数据库导入能力。
