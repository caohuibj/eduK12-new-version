# Cognitive review R1–R7：本地修复交付

日期：2026-10-01。基线：main `54500a89739fcde54c73264197be0d352234fb7b`；本地分支：`feat/cognitive-review-fixes-local`。

R1–R7 的代码修复与本地验收已完成。未 push、未创建 PR、未触发远端 CI、未部署。评分、计时、种子、配置身份、历史冻结结果及科研专用指标权限未调整。所有截图和 PDF 使用合成作答，不包含真实被试信息。

## 修复结果

| 项目 | 原问题 | 本轮处理与验证 |
| --- | --- | --- |
| R1 | 个体杂志报告遗漏匿名编号；完成时间不稳定地出现在打印中 | 新增共享记录信息区，匿名编号和完成时间在屏幕、PDF 均可见；保留旧格式阅读。 |
| R2 | Matrix 在 320px 宽度下格子重叠约 18.67px | 修正网格在窄容器中的居中布局，保持 96px 刺激格、8px 间距和 320px 网格；练习及真实进入正式阶段后，相邻重叠均为 0px。 |
| R3 | 后台记录使用分页序号，缺少稳定标识、时间及可打印任务名 | 使用由随机 session ID 与任务 ID 生成的报告范围匿名标识；跨分页稳定；不返回原 session/user ID。任务名、标识与冻结完成时间进入打印正文。手机选择器不会撑开页面。 |
| R4 | 代码覆盖被误当作现有发布任务全部升级 | 新增只读发布目录与冻结策略盘点 CLI、分类结果和处置流程；空发布目录明确返回 NO_PUBLISHED_ASSIGNMENTS。28 个注册身份及声明 profile 的冻结验证、真实 PostgreSQL 冻结回读验证通过。没有迁移既有任务。 |
| R5 | 杂志版隐藏了原来可读的详细记录 | 增加默认折叠的“进一步看这次记录”，只展示既有冻结报告允许的 detail 指标及适用参考；去重、屏蔽 withheld 指标，支持键盘与展开后打印。 |
| R6 | 小字号青绿色文字对比度不足 | 正文强调色改为 #0b706a；实际浏览器测得白底对比度 5.93:1，记录区辅助文字 5.49:1。图形和测验刺激颜色保持原值。 |
| R7 | 任务引导页视觉割裂，公共阶段标题混用英文 | 24 类任务入口均使用公共引导呈现，统一深蓝/青绿视觉和中文阶段提示。保留各任务说明内容、练习规则和回调；正式任务刺激 UI 未统一替换。 |

打印复核另修正了页脚单独占页的问题，将打印依据与页脚保留在同一内容块。个体反应时样稿和展开详细记录的 Matrix 样稿均为 2 页；后台专业报告保留更高信息密度，样稿为 3 页。打印隐藏交互焦点框，屏幕上的键盘焦点提示继续保留。

## 样稿与视觉证据

- [图文验收总览](assets/cognitive-report-upgrade/review-fixes/index.html)
- [个体报告完整 PDF](assets/cognitive-report-upgrade/review-fixes/participant-report.pdf) · [后台专业报告完整 PDF](assets/cognitive-report-upgrade/review-fixes/professional-report.pdf)
- [个体报告截图](assets/cognitive-report-upgrade/review-fixes/participant-report.png) · [后台报告与记录选择器](assets/cognitive-report-upgrade/review-fixes/professional-reader.png)
- [后台 320px 手机截图](assets/cognitive-report-upgrade/review-fixes/professional-reader-320.png)
- [Matrix 修复前](assets/cognitive-report-upgrade/review-fixes/matrix-before-320.png) · [修复后练习](assets/cognitive-report-upgrade/review-fixes/matrix-after-320.png) · [修复后正式阶段](assets/cognitive-report-upgrade/review-fixes/matrix-formal-320.png)
- [详细记录展开截图](assets/cognitive-report-upgrade/review-fixes/matrix-details.png) · [展开后打印 PDF](assets/cognitive-report-upgrade/review-fixes/matrix-details.pdf)
- [反应时引导页](assets/cognitive-report-upgrade/review-fixes/reaction-intro-390.png) · [塔式规划引导页](assets/cognitive-report-upgrade/review-fixes/tower-intro-390.png)

截图通过真实 React 组件、AssessmentShell 和当前 CSS 生成，未人工绘制或修图。正式 Matrix 验收先完成练习再进入正式阶段。预览页面使用合成状态和模拟报告 API，不等同于线上浏览器验收。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| 后端 cognitive、assessment-runtime、reporting | 105 文件、766 测试通过；6 文件、29 测试跳过（不计入通过） |
| 前端 cognitive、reporting、composite、teacher | 71 文件、306 测试通过 |
| PostgreSQL 报告集成 | 2 测试通过；核验冻结回读、权限、稳定标识及只读盘点不改写快照 |
| 末轮报告组件回归 | 7 测试通过，包含记录信息、详细层披露和专业报告上下文 |
| 构建与静态检查 | 前端类型检查、前后端构建、cognitive contracts 通过；lint 0 error、112 项既有 warning |
| 报告浏览器矩阵 | 36 合成记录 × 2 类读者 × 1280/390/320px，共 216 个检查通过 |
| 任务及补充报告交互 | 24 类引导 × 4 宽度、20 次练习布局、4 次 Matrix 正式布局，共 120 个布局检查通过；另验收两个后台手机宽度、匿名记录、键盘展开、记录切换、打印上下文及文字对比度 |

末轮目标测试与此前回归有重叠，不重复计入总测试数。详见 [结构化验证摘要](assets/cognitive-report-upgrade/review-fixes/local-validation.json)。完整日志和生成预览位于本地 `/workspace/cognitive-report-fixes-20261001`，大型编译预览不进入仓库。

视觉验收可重现：安装仓库依赖、准备 Chromium 与 Poppler（`pdfinfo`、`pdftotext`），并先执行 frontend 的 `npm run build`。之后在仓库根目录运行：

```bash
node server-version/scripts/cognitive/review-fixes-preview-build.cjs /tmp/cognitive-review-preview
node server-version/e2e/cognitive-review-fixes-preview.cjs /tmp/cognitive-review-preview
node server-version/e2e/cognitive-report-audiences-preview.cjs /tmp/cognitive-review-preview/reports/report-preview.html /tmp/cognitive-review-preview/evidence
```

任务/交互检查使用 `/usr/bin/chromium` 和 Asia/Tokyo 时区；报告组合检查沿用原有预览脚本。输出均为合成样本与本地文件，不调用部署业务 API。

## 发布覆盖的实际边界

本轮盘点仅使用一次性本地测试数据库：12 个发布配置、0 个发布任务，正确返回 `NO_PUBLISHED_ASSIGNMENTS`。因此不能宣称实际部署的旧发布任务已经全部获得新版双报告。

R4 已完成工具、空目录识别、冻结分类和本地验证。真实部署的发布盘点及浏览器作答回读仍是发布时的验收工作，见 [只读盘点与发布流程](cognitive-report-rollout-runbook.md)。历史任务继续读取原冻结报告；需要新版本时为后续作答创建新任务，不自动重写历史结果。

用户再次授权发布后，先获取最新 main 并做差异/冲突检测，按实际变化补充验证，再执行授权范围内的 push 与 CI。本轮不提前执行这些远端动作。
