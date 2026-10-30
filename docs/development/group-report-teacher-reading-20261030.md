# Teacher 既有 Form 群报阅读升级（2026-10-30）

独立后续分支 feat/group-report-teacher-reading-20261030，base School a7969866f2f1106f82e810b550675badce0f1656；不改 PR408 已验候选，也不把本批混入 PR414。

替换 HuiteacherEvaluationStudio 的既有裸列表：学校产品管理员仍沿原学校改进 → 评价活动 → 查看任务配置 → Form 已发布群报入口访问，现有 GET /released、POST /release、Legacy GET 与 MFA/产品管理员判断不改。页面只消费已授权投影，复用 ReportPrimitives 和 task-group-report 打印样式；题目切换、全屏、打印全部题目与限制，标题、原发布时刻、固定定义和说明可读。一次只呈现当前选中报告，避免打印多个活动报告。报告来源、计算、存储和权限没有新增第二套。

人数隐藏时显示“受限展示”；原取整比例和0%保持，不据其推算人数。多选分母如实使用既有后端的纳入参与者（含拒答/缺失），允许合计超过100%；自由文本和未获准题型继续显示原抑制原因。活动/表单标题是当前名称，明确不冒称历史冻结标题；旧规则未提供发布时间则如实标注，不补造生成时间。延迟响应复用现有 context ref 限制到发起时的学校/账号，不另造会话或权限框架。

仅新增一条真实 HuiteacherApp 导航测试。初次匹配到登录加载前公共首页的同名按钮，诊断后限定真实 Teacher 工作台导航；进入报告后，第二处断言把两个合法取整说明当成唯一文本，修正夹具断言。保留每份原始失败结果，没有删除或把失败改成成功。最终单case通过。浏览器首次只在 fixture 构建中缺 public 绝对资源解析失败；加入指向现有 public 资产的有界解析后实际旅程首次运行通过。真实 TeacherApp 导航、读取既有发布、切题、全屏、1440/390报告布局、全部题目与抑制说明的两页中文 PDF 均完成。身份/API为合成夹具，不声称真实后端或生产授权验证。21MB临时 bundle 不再复制入仓库，源码/锁文件输入、bundle哈希和截图/PDF证据保留。

本批不新增统计后端，backend树315616d1b8fead0cbbd340822ef8828498007cb9沿用School当前已验编译/PG，不重跑37项或旧Training175。Teacher现有COGNITIVE/SJT/Bundle任务的 assertTeacherPersonalAssessmentPolicy 要求INDIVIDUAL_ONLY，不能为群报绕过它；Teacher子群与其他来源适配、School Form、旧 no-leaf V1 整组合同问题仍待后续。学生评教与专家共识保持各自专属路径。群体纵向等待既有个人纵向契约。

当前仅 Draft 准备，不激活正式CI、不合并、不部署、不修改真实用户/数据/权限。

最终frontend树00a843d3164e16ae7b7b4045ee0597db2812d790真实 app types exit0，3个触达前端文件lint exit0（原有scopeGeneration cleanup-ref警告1条，未改规则/阈值）。原执行无签名，报告和输入后续精确归档，不伪造历史签名或称本地等于正式CI。

## mainfa / PR414 资格等待期间的独立收口

只在本Reader分支合入School已冻结候选77e276724，检查点68f047824a940595a9a9346298235c3f4cddaa56；不修改PR414候选。当前backend tree2342ff04dd851b9c82383fd5835f35935ecb67fa与School实际已验tree完全相同，复用原类型收据，不运行后端检查。当前Reader frontend treeb6e7cfb9d6bd52c9f67fcb3b744f3d9b8936f31f实际仅补一次app类型检查，exit0。原导航/浏览器/PDF不重播。PR415保持Draft，尚无自己的正式CI资格。

## PR414旧基线正式原件归档（不改其已验候选）

正式41057783824在candidate77e276724/basefa038041上四作业成功，41个观察实际接纳而非重播；完整126作业列表、原件接纳JSON、两个ZIP的真实下载哈希及原SARIF lossless gzip已在本后续分支归档。SARIF保留一条主线既有测试断言告警，不声称零告警，不改旧源码/阈值。School已验77候选不变。

用户批准406/414依次合并后，新mainfb3a0cab6f3f28e737a38550167ff6b2affcae56尚未在此节点对齐：Git fetch认证失败，新对象本地不存在。GitHub API仍可读，Hui新审阅页已成功追加正式原件与准确阻碍，未重复两项修复结论。停止Git凭据重试，不用旧run代替新基线资格；这些归档先本地保存，恢复Git传输后再推送。没有合并或部署。

## main406 / School最终资格归档

Git公开只读fetch成功后，PR414原分支完成mainfb对齐。通过既有授权官方Git数据API逐对象保留并验证本地SHA（40对象），再按期望旧head77e276724快进原School分支到f5fabe490；未新建凭据、未改main。实际merge78c76f50父提交为mainfb和该candidate，tree122aceed8与source相同。正式41062520295四作业全部success、126作业完整分页核对；41观察继续接纳未重播，两个ZIP均实际核验，SARIF保留同一条历史测试断言告警。旧凭据故障为历史，当前资格完成，node不合并/部署。正式原件在本后续分支mainfb/formal目录，School已通过candidate不改。

本Reader独立合入该School候选后，检查点704a0ab779929592f201a54d367a9d9e295f29c9当前frontend treeb672a3fcf90f535079675048a7a013fbbbf660fb只补一次app类型检查，exit0。backend tree与School dc9a331f完全相同，复用其新收据，不重复后端/业务/PG/浏览器。PR415仍Draft，无自己的正式资格。旧d1fe67归档保留为祖先。

## main414 后的 Reader 准备

无冲突合入真实main43d119c9bfbc7949baab2edea29d96044b04607c，检查点91487d27e12e60cd30895d5e5327016552f9a45a。backend dc9a331f、frontend b672a3fc组件tree都未变化，沿用已实际通过的mainfb类型收据，没有再次编译。五个Reader应用/夹具源blob与产品380b90cd7完全相同，原导航/浏览器/打印不重播；分母、NON_EXCLUSIVE、隐藏人数及取整字段已核对现有原生服务输出，没有新增产品功能。

唯一准备缺口是PR415缺现有精确资格命名空间。沿onboarding-structure增加固定415的frontend-only源/模式/组件绑定与原浏览器观察接纳，不新增workflow或后台服务。仅补一个控制用例，实际1PASS；保持候选禁用和PR Draft，按DOT要求不与正在对齐的409进入合并队列。这里只是准备，后续自然节点再绑定当时真实main/merge，不声称正式资格成功。418的子群/版本与目录刷新修复独立保留，不混入本Reader切片。
