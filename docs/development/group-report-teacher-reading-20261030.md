# Teacher 既有 Form 群报阅读升级（2026-10-30）

独立后续分支 feat/group-report-teacher-reading-20261030，base School a7969866f2f1106f82e810b550675badce0f1656；不改 PR408 已验候选，也不把本批混入 PR414。

替换 HuiteacherEvaluationStudio 的既有裸列表：学校产品管理员仍沿原学校改进 → 评价活动 → 查看任务配置 → Form 已发布群报入口访问，现有 GET /released、POST /release、Legacy GET 与 MFA/产品管理员判断不改。页面只消费已授权投影，复用 ReportPrimitives 和 task-group-report 打印样式；题目切换、全屏、打印全部题目与限制，标题、原发布时刻、固定定义和说明可读。一次只呈现当前选中报告，避免打印多个活动报告。报告来源、计算、存储和权限没有新增第二套。

人数隐藏时显示“受限展示”；原取整比例和0%保持，不据其推算人数。多选分母如实使用既有后端的纳入参与者（含拒答/缺失），允许合计超过100%；自由文本和未获准题型继续显示原抑制原因。活动/表单标题是当前名称，明确不冒称历史冻结标题；旧规则未提供发布时间则如实标注，不补造生成时间。延迟响应复用现有 context ref 限制到发起时的学校/账号，不另造会话或权限框架。

仅新增一条真实 HuiteacherApp 导航测试。初次匹配到登录加载前公共首页的同名按钮，诊断后限定真实 Teacher 工作台导航；进入报告后，第二处断言把两个合法取整说明当成唯一文本，修正夹具断言。保留每份原始失败结果，没有删除或把失败改成成功。最终单case通过。浏览器首次只在 fixture 构建中缺 public 绝对资源解析失败；加入指向现有 public 资产的有界解析后实际旅程首次运行通过。真实 TeacherApp 导航、读取既有发布、切题、全屏、1440/390报告布局、全部题目与抑制说明的两页中文 PDF 均完成。身份/API为合成夹具，不声称真实后端或生产授权验证。21MB临时 bundle 不再复制入仓库，源码/锁文件输入、bundle哈希和截图/PDF证据保留。

本批不新增统计后端，backend树315616d1b8fead0cbbd340822ef8828498007cb9沿用School当前已验编译/PG，不重跑37项或旧Training175。Teacher现有COGNITIVE/SJT/Bundle任务的 assertTeacherPersonalAssessmentPolicy 要求INDIVIDUAL_ONLY，不能为群报绕过它；Teacher子群与其他来源适配、School Form、旧 no-leaf V1 整组合同问题仍待后续。学生评教与专家共识保持各自专属路径。群体纵向等待既有个人纵向契约。

当前仅 Draft 准备，不激活正式CI、不合并、不部署、不修改真实用户/数据/权限。

最终frontend树00a843d3164e16ae7b7b4045ee0597db2812d790真实 app types exit0，3个触达前端文件lint exit0（原有scopeGeneration cleanup-ref警告1条，未改规则/阈值）。原执行无签名，报告和输入后续精确归档，不伪造历史签名或称本地等于正式CI。
