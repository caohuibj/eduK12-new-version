# Cognitive 报告：个体科普版与后台专业版

日期：2026-10-01（Asia/Tokyo）。状态：本地实现和验证完成，等待用户明确告知远端 main clean。

本轮承接用户对两版文字的反馈，以及“更成熟简洁，接近科普杂志”的视觉选择。覆盖 24 个真实测验家族、28 个真实精确注册身份；使用相同冻结结果，分别呈现科普内容和专业内容。工作分支 `feat/cognitive-report-upgrade-local`，远端 review 基线 `f70078adcd7c1220f205559e34cd3d719b3b6ce4`，上一轮本地实现提交 `48567293`。本轮未 push、未创建 PR、未触发远端 CI、未 merge，也未发布部署实例上的测验配置。

## 可直接查看的样稿

- [离线交互预览](assets/cognitive-report-upgrade/audiences/report-preview.html)：浏览器打开后可切换 36 个模拟作答和两种阅读版本，查看图表数据、展开阅读说明、打印。使用实际评分器与实际 React 组件，不请求业务 API。
- 反应时：[个体版桌面截图](assets/cognitive-report-upgrade/audiences/reaction-magazine-desktop.png)、[后台版桌面截图](assets/cognitive-report-upgrade/audiences/reaction-professional-desktop.png)、[个体版手机截图](assets/cognitive-report-upgrade/audiences/reaction-valid-participant-mobile.png)、[后台版手机截图](assets/cognitive-report-upgrade/audiences/reaction-valid-professional-mobile.png)。
- [个体版 PDF](assets/cognitive-report-upgrade/audiences/reaction-participant.pdf)、[专业版 PDF](assets/cognitive-report-upgrade/audiences/reaction-professional.pdf)。
- 有效记录不足：[个体版](assets/cognitive-report-upgrade/audiences/reaction-insufficient-participant-mobile.png)、[专业版](assets/cognitive-report-upgrade/audiences/reaction-insufficient-professional-mobile.png)。
- 数字记忆：[个体版桌面](assets/cognitive-report-upgrade/audiences/memory-magazine-desktop.png)、[个体版手机](assets/cognitive-report-upgrade/audiences/memory-standard-participant-mobile.png)、[专业版手机](assets/cognitive-report-upgrade/audiences/memory-standard-professional-mobile.png)。
- SST：[个体版标准桌面](assets/cognitive-report-upgrade/audiences/sst-magazine-desktop.png)、[专业版标准桌面](assets/cognitive-report-upgrade/audiences/sst-professional-desktop.png)、[个体版标准手机](assets/cognitive-report-upgrade/audiences/sst-standard-participant-mobile.png)、[专业版标准手机](assets/cognitive-report-upgrade/audiences/sst-standard-professional-mobile.png)、[个体版短程手机](assets/cognitive-report-upgrade/audiences/sst-experience-participant-mobile.png)、[专业版短程手机](assets/cognitive-report-upgrade/audiences/sst-experience-professional-mobile.png)。
- [浏览器验证](assets/cognitive-report-upgrade/audiences/browser-validation.json)、[本地验证汇总](assets/cognitive-report-upgrade/audiences/local-validation.json)。

全部截图和 PDF 使用合成作答，不含真实学生资料。上一轮实现及其证据保留在 [原交付说明](cognitive-report-upgrade-implementation.md)，本文件记录本轮新增内容。

## 两版内容如何区分

| 阅读对象 | 内容与表达 | 反应时示例 |
|---|---|---|
| 被试个体、学生与家长 | 本次经历、通俗指标解释、三步概念图、生活或职业示例、可记住的一句话、下一步行动。 | 标题“从看见，到出手”；“在 20 次尝试中，你留下了 18 次有效回应。通常一次回应用了 310 毫秒。”解释取中间记录的含义；“快，是看清之后的回应。” |
| 已有权限内的教师、管理员 | 结果摘要、任务构念、操作与计算口径、冻结协议参数、指标定义与解读边界、完整质量标记、撤下原因、版本依据。 | 正式区分中位反应时、平均反应时、标准差、变异系数、遗漏和提前反应；注明有效 RT 的范围和 ICV 的计算定义，结合质量状态解释。 |

科普版以深蓝、青绿和少量赭色为共同视觉语言，采用清晰留白和矢量过程图。图解解释概念，不装饰能力等级。驾驶与运动示例说明“识别—回应”的过程，也明确不能由按键记录推断驾驶安全、运动成绩或职业适合度。其余任务分别用回看消息、规则切换、空间规划等情境解释，不套用同一段泛化文案。

专业版独立排版，并非把术语附在科普首屏。指标名称使用正式定义；例如 SST 解释积分法与均值 SSD，N-back 解释 Hautus 修正 d′，任务切换和 Stroop 解释条件差值，BART 解释选择性成功兑现轮次均值。撤下数值只列原因，不向教师补回未经允许或未满足质量条件的估计。专业程度不等同于新增科研数据权利，也不等同于科学效度认证。

## 后台实际入口与权限

教师认知任务页面新增“阅读专业报告”，按页读取 10 份已完成记录，可切换记录、翻页并打印。新增读取路由 `GET /cognitive/assignments/:id/reports`，使用登录与教师角色中间件，并复用已有导出的 `getAssignmentForTeacher` 归属检查：任务所属教师和已有管理员权限可读，其他教师与学生不可读。

服务仅查询尝试编号、综合尝试关联和加密结果快照；展示匿名序号，不返回参与者姓名、用户/会话 ID、原始提交或刺激答案。不从当前注册表重新评分或补写。综合测评 wrapper 和群体专用关联仍使用原有流程，不经此入口返回个体结果。分页有数量上限，未知查询参数拒绝；读取失败清除前端上一份缓存，避免把旧报告误认为当前结果。

参考信息仅保留已展示且通过质量门控的指标；无效记录不返回比较。没有新增科研专用指标、公开分享链接或服务端 PDF 接口。教师/管理员版在本轮明确允许的既有权限范围内完善解释。

## 冻结、历史与上线边界

任务 `presentationVersion=1.2.0`，解释策略/报告规则 `1.1.0`；报告与 reading 的 `schemaVersion` 仍为 2。新增 `popular` 和 `professional` 均为可选字段，随既有 assignment 呈现机制冻结，并与结果一次保存。未改评分、计时、刺激、种子、协议配置、runtime/config hash 或发布状态。

旧冻结报告继续原有阅读方式；后台能读的旧版本只显示已保存结果，并提示新版方法说明缺失。旧格式未保存版本化报告时保留原授权导出入口，不根据当前代码生成一份伪历史报告。因此代码合入不会让所有既有发布任务自动获得新版文案；重新发布或迁移既有任务须按独立生命周期安排，不批量改写历史结果。

## 验证与截图发现

| 检查 | 结果 |
|---|---|
| Backend cognitive 回归 | 84 文件通过，652 项通过；3 文件中的 8 项 opt-in 测试跳过，未计为通过。 |
| 报告规则、冻结、专业读取与实际数据库定向检查 | 21 项通过；其中包含 2 项 PostgreSQL 实际提交与归属检查。最终快照读取调整后再次运行数据库 2 项通过。与回归套件重叠，不相加。 |
| Frontend cognitive、reporting、教师任务编辑回归 | 57 文件，258 项通过。最后显示调整后定向重跑 10 项通过。 |
| 构建与静态检查 | Backend build、cognitive contracts、Frontend typecheck/build 通过；Frontend lint 0 errors，112 条仓库已有 warnings，新组件无 lint warnings。 |
| Chromium 实际组件预览 | 36 样例 × 两版 × 1280/390/320px，共 216 组合通过；保存 15 张截图、2 份打印 PDF。无页面/图表横向溢出，无运行错误。 |

截图检查涵盖反应时有效/不足、数字记忆和 SST 短程/标准。手机图解改为图与文字同行，专业表格改为逐项记录；长标题与定义不裁切。键盘可展开科普阅读说明，打印仍保留关闭说明中的限制和版本，专业报告打印排除后台任务编辑控件，并将版本依据作为完整块保留，避免被拆到独立尾页。

有效记录不足时两版均撤下速度数值和相应图表；短程 SST 均不展示 SSRT 数值。专业报告保留触发与未触发的质量标记供复核，正向且不影响解释的标记不使用警告色。

数据库验证使用 disposable 本地数据库，真实调用 createSession → final submit → 加密结果持久化 → 重复提交 → 历史回读 → 归属教师的专业读取，同时拒绝其他教师与学生。浏览器样稿不连接业务 API，后台权限由服务测试和数据库检查验证，未声称完成登录后的全链路浏览器验收或生产部署验收。仓库既有 bundle 大小提醒仍存在。

## 复现与后续发布

加载 onboarding 的 Node 与本地测试环境后，沿用 [原复现命令](cognitive-report-upgrade-implementation.md#本地复现)。预览构建脚本现在生成两版；原浏览器验证入口按新元数据自动调用两版验证器。数据库定向套件增加 `professional-report.service.test.ts`；前端增加 `CognitiveReportAudiences.test.tsx` 与既有 `CognitiveAssignmentEdit.test.tsx`。

远端发布仍遵循 [working agreement](cognitive-report-upgrade-working-agreement.md)。收到用户 main clean 信号后对齐最新 main，检查冲突及冻结/权限/共用样式的语义兼容，针对最终提交验证，再 push、创建 PR 并触发 CI；门槛通过后 merge。当前产物仅保存本地。
