# 候选与必要检查范围

验收目标：CEEDAR-hosted FIN DI 一个母工具的5份私有原生 Form 隔离候选、公开来源/结构/反馈/验证证据。执行基线 `25d812d1f024bcc375b738235dd400654c679ff4`；提交前 fast-forward 至实际 main `6cad86d8f721a45a47a91290edf1523519d1d239`。9个原生消费者/schema/lock文件哈希全部一致，已成功的5次数据库提交不重复执行。详细输入在 `consumer-inputs.json`；真实 source/head/tree/raw diff 随 Git 提交及 PR 记录，不伪造自引用提交哈希。

全部公开差异均为本证据目录新增 mode100644 Markdown/JSON：原题、载荷、CSV、测试脚本留本地；没有源注册、运行时自动加载内容、UI、应用代码、schema、依赖、权限、门禁或工作流变更。本次属于现有 `documentation` 路由，scope → documentation → stable merge gate；独立 Situational publication 的实际状态另行回读。未使用 skip-ci，不重跑旧 CHEXI parser 失败、不引入 CI 修改，不运行无关全后端/前端、Docker、浏览器或生产测试。

已读仓库 AGENTS、release README 与 Qiang 连接的 CI 常见错误清单。适用项：CI-004（按真实 mode/path/blob 分类，公开文档不冒充运行时内容导入）、CI-020（保留执行基线与提交/merge 身份、真成功与未执行分开）。当前没有应用变动，不扩展为旧条目全量检查。新任务未运行正式 CI 时不称 CI 通过；本地 schema/dry-run、真实 router HTTP/隔离 PG 回读不能替代正式 required jobs。

本地已完成：5份 Form 定义/CSV 构建；真实 HTTP 保存/回读；15组事实/缺失场景；无 scores/report；授权401/403；非法枚举和数字/文本边界；共同家族元数据5项分组；来源/作者/版本/题项片段排重；公开文件无原题检查；JSON与 diff 检查。保留原大写机器键失败及其小写键修复。无人工独立审核/APPROVE、无 ONLINE、无真实教师数据、无生产写库、无部署。版权和生产最终排重为明确待办。

提交者自行核对代码、材料、路径与必要检查，未伪称人类独立评审。本 PR 交由主线按现有授权和实际必要 CI 串行协调合并。
