# Cognitive 报告升级：本地交付与验证

日期：2026-10-01 UTC。实现分支：`feat/cognitive-report-upgrade-local`。
代码基线：`main@f70078adcd7c1220f205559e34cd3d719b3b6ce4`；方案提交：`f26223b5`。

本轮已实现并完成本地验证。**用户明确确认远端 main clean 前，不 push、不创建 PR、不触发远端 CI、不 merge。** 约定见 [working agreement](cognitive-report-upgrade-working-agreement.md)。主工作区未用于实现；实现保存在 `/workspace/eduK12-cognitive-report-upgrade`。

## 可直接查看的产物

- [交互报告预览](assets/cognitive-report-upgrade/implementation/report-preview.html)：下载后在浏览器打开；离线自包含，无 API 请求。36 个合成作答样例，使用实际评分器和实际 React 报告组件，可以切换报告、展开详细解读、查看图表数据和打印。
- [反应时首屏](assets/cognitive-report-upgrade/implementation/reaction-desktop.png)、[反应时详细解读](assets/cognitive-report-upgrade/implementation/reaction-detail.png)、[5/20 有效记录](assets/cognitive-report-upgrade/implementation/reaction-insufficient.png)、[中断记录](assets/cognitive-report-upgrade/implementation/reaction-interrupted.png)。
- [数字记忆](assets/cognitive-report-upgrade/implementation/memory-desktop.png)、[SST 短程](assets/cognitive-report-upgrade/implementation/sst-experience.png)、[SST 标准](assets/cognitive-report-upgrade/implementation/sst-standard.png)。
- 手机截图：[反应时](assets/cognitive-report-upgrade/implementation/reaction-valid-mobile.png)、[详细解读](assets/cognitive-report-upgrade/implementation/reaction-detail-mobile.png)、[记忆](assets/cognitive-report-upgrade/implementation/memory-standard-mobile.png)、[SST](assets/cognitive-report-upgrade/implementation/sst-standard-mobile.png)。
- 补充详细层截图：[矩阵规则类别](assets/cognitive-report-upgrade/implementation/matrix-detail-mobile.png)、[配对学习轮次](assets/cognitive-report-upgrade/implementation/pairedassociate-detail-mobile.png)、[图片顺序轮次](assets/cognitive-report-upgrade/implementation/picturesequence-detail-mobile.png)。
- [浏览器打印 PDF](assets/cognitive-report-upgrade/implementation/reaction-report.pdf)、[浏览器验证记录](assets/cognitive-report-upgrade/implementation/browser-validation.json)、[本地验证汇总](assets/cognitive-report-upgrade/implementation/local-validation.json)。

这些是模拟作答，未使用真实学生数据，也未证明目标部署实例的发布清单。原方案中的静态设计样稿继续保留；上述截图来自实际实现。

## Review 问题与实际处理

| 问题 | 本轮结果 |
|---|---|
| 有效反应不足仍突出速度 | 5/20 与 0/20 撤下速度结论、速度图和相关参考比较；保留完成数量与限制。 |
| `limited` 被当作统一展示规则 | 保留原 scorer 的 quality，新增独立的 interpretation；不足时 withheld，中断时 qualified，按指标分别门控。 |
| 冻结协议限制未进入报告 | completion、final-submit、unified-final-submit 三条路径均传入同一冻结上下文中的 caveats/config/trials。 |
| 只有数字与通用术语 | 每个任务有自己的标题、介绍、数据模板、证据 keys 和操作建议；首屏显示毫秒、位、次等单位，技术原文在详细依据中保留。 |
| SST 估计被读成个人抑制能力 | 短程隐藏 SSRT；标准/科研中 SSRT 按估计条件门控；允许的过程记录单独保留，停止响应概率不作越低越好的能力解释。 |
| 记忆跨度被读成一般能力上限 | 明确本次正确序列长度；达到冻结 maxLength 时提醒协议上限；图表有每个长度的实际分母。 |
| 任务视觉分裂 | 统一深蓝/青绿、质量色、信息层级、指标卡和打印风格；任务示意与图表可不同。 |
| 图表缺失填零或不同单位混合 | 反应时缺失单独标记；长度图仅含实际测量项；一般柱图只用相同单位；Nback 按难度显示真实 d′，保留负值。 |

## 范围、版本和历史兼容

覆盖 24 个真实测验家族、28 个精确真实注册身份（注册表另有 fake，共 29 项）。不是改变评分数学，也没有调整刺激、计时、协议配置、种子或发布状态。

新增报告 `schemaVersion=2`、`reading.schemaVersion=2`、`reading.reportVersion=1.0.0`，任务呈现策略 `presentationVersion=1.1.0`。`qualityState` 与 `reading.interpretation` 分开保存；反馈、限制、图表和呈现版本一起进入原有加密结果快照。沿用 assignment 原有呈现冻结机制，呈现变化不进入 runtime/config hash。

新策略只用于冻结了 `reportReading` 的新任务报告。已有 assignment 和历史结果仍保留原冻结策略与旧卡片；不会因为当前注册表更新而静默重算。因而这轮代码合入后，既有发布任务未必自动显示新版报告，业务任务重新发布或迁移需要独立安排。历史报告阅读提醒仅保留方案，未批量附加或改写。

用户已明确选择“仅完善已有权限内的解读”。学生/家长首屏与详细解读使用同一份已允许的数据；切换视图不是授权动作。本轮没有新增科研专用指标读取入口，没有输出 `research_only` 或原始试次，也没有新增其他学生结果读取权限。科研协议样例只说明该协议下参与者当前允许的报告内容。

打印使用产品卡片的 `window.print()`，浏览器可保存 PDF；打印自动展示详细依据并保留质量限制、单位和版本。公开分享卡、服务端 PDF 生成接口不在本轮范围。

## 视觉和交互验证

生成实际组件预览后用 Chromium 验证 36 个样例，覆盖 1280、390、320px 页面宽度。三类样板留存桌面及手机截图，另留存不足、中断、详细解读与打印产物。所有36个样例的学生层和详细层均在390/320px检查溢出，额外检查矩阵类别和学习轮次展示。

截图检查发现并修复了手机图表仅显示部分横轴、SST 长标签被裁切、详细表格横向阅读的问题。当前 SVG 随容器调整，长标签换行，手机详细表格逐条排列；集合指标按任务类别或逐轮记录展示，并按比例/次数/用时保留单位及缺失。缺失反应在独立标记带中呈现，不放在 0ms 位置；图表有文本说明和可展开数据。

浏览器检查包括分层按钮鼠标/键盘激活、限制首屏可见、速度撤下、短程 SST 隐藏 SSRT、页面及图表无横向溢出、手机详细层无页面溢出、打印详细层显示及无浏览器运行错误。14 张截图和 PDF 为实际留存结果。没有声称完成所有操作系统/浏览器或真实设备矩阵验收。

## 验证结果

| 检查 | 结果与边界 |
|---|---|
| Backend cognitive 回归 | 83 个测试文件通过，647 项通过，8 项 opt-in 集成测试跳过；跳过不计为通过。 |
| 报告/冻结/实际数据库定向检查 | 16 项通过：11 项新版规则、2 项真实 PostgreSQL 提交、3 项既有冻结回归；其中多数与上述套件重叠，不相加。 |
| Frontend cognitive + reporting 回归 | 55 个文件、252 项通过；最后显示调整后重跑新版卡片 4 项通过。 |
| 类型与构建 | Backend build、Frontend typecheck/build 均通过。 |
| 契约与 lint | cognitive contracts/依赖边界检查通过；Frontend lint 0 errors、112 条已有 warnings，新组件无 lint warnings。 |
| 浏览器 | 36 个实际评分器样例与实际组件通过，14 张截图、1 份打印 PDF；使用合成数据。 |
| 代码卫生 | `git diff --check`、预览脚本语法检查通过。 |

PostgreSQL 验证的是 reaction 两个质量状态的真实 createSession → final submit → 加密结果持久化 → 重复提交 → getSession 历史回读及错误归属 403。memory 和 SST 三协议使用实际评分器与组件、另有门控单元测试；本轮未新增它们的数据库端到端场景。三条完成路径在源代码中接入，已有相关回归一起执行。

构建仍有仓库既有的大 bundle 提醒和上述 lint warnings，本轮未扩展到无关模块的清理。测试与截图证明本地实现行为，不替代科学效度研究、人口常模验证或生产部署验收。

## 本地复现

仓库依赖应按环境 onboarding 安装。加密相关测试必须加载本地测试环境，不能只激活 Node。全量后端回归用单 worker：现有库边界检查会扫描 checkout，多个测试同时创建/删除临时 fixture 时可能产生 ENOENT；本轮未修改这一无关测试。当前云实例的 Node 工具激活脚本为 `/workspace/eduk12-cloud/activate.sh`；测试环境初始化脚本为 `/workspace/eduk12-cloud/load-local-env.sh`。它们是当前实例辅助文件，不进入源码或产物；不得打印凭据。实际数据库测试仅使用 disposable 本地测试数据库，需已有 migrations 和 reaction1.1.0 配置。

在仓库根目录生成预览及截图：

```bash
node server-version/scripts/cognitive/report-reading-preview-build.cjs /tmp/cognitive-report-preview
node server-version/e2e/cognitive-report-reading-preview.cjs /tmp/cognitive-report-preview/report-preview.html /tmp/cognitive-report-evidence
```

在 `server-version/backend`：

```bash
./node_modules/.bin/vitest run src/__tests__/cognitive --maxWorkers=1
COGNITIVE_INTEGRATION_DB_URL="$TEST_DATABASE_URL" ./node_modules/.bin/vitest run src/__tests__/cognitive/report-reading.test.ts src/__tests__/cognitive/report-reading.postgres.integration.test.ts src/__tests__/cognitive/participant-presentation-freeze.test.ts --maxWorkers=2
npm run cognitive:contracts
npm run build
```

在 `server-version/frontend`：

```bash
./node_modules/.bin/vitest run src/modules/cognitive src/modules/reporting --maxWorkers=2
npm run lint
npm run typecheck
npm run build
```

## main clean 后的已授权流程

收到用户明确 clean 信号后，重新读取远端 main，检查新提交与本轮冻结/完成/读取路径的语义变化，解决冲突并针对最终 SHA 重跑相关验证；再 push 工作分支、创建并附加 PR 触发 CI。当前 CI 和保护要求满足后才 merge，并执行合入后的 smoke。当前没有执行任何远端写入。
