# 候选验证与主线复核交接

修改组件 → 4项Harvard TSR目录source与确定性注册索引、研究/报告说明。主要故障 → 同义重复、目录误变可施测、未许可题文外泄、把报告草案当实际R。主要执行位置 → 本线程已完成原生目录发现、无运行时/无报告资格及写库前拒绝边界；正式内容选中检查仍留给既有Scale轻路线。无前后端业务、schema、锁文件、引擎、权限或门禁变动。

基线：`adad907a4b68606ce71bb1a4f2d7c511c872c715`。最终head/tree及完整diff以Draft PR描述和Git对象回读为准。源码4个source的SHA-256及报告文稿SHA-256在validation.json。原Node 24.19.0与现有依赖仅支持本次本地结果，不冒充官方Node 24.21.0干净安装；backend package-lock SHA-256=`11b5fce38cb9a708a8ba28b99882a65e0b4d3719ea63e300b1e5c31f406cf591`。无DB/Redis/浏览器fixture，无真实学生数据。

已读 [CI常见错误清单](https://app.notion.com/p/404d27635a388186ac80de3593da05a5)。Hui连接未找到该页，Qiang连接只读成功；未写回或更改页面共享。只筛选：

- CI-007：索引由现有`npm run scale:instruments:generate`一次生成；正式`scale:instruments:check`尚NOTRUN，不能把生成命令称为--check成功。
- CI-020：本地来源/输入摘要有记录；精确base/head/tree由交付及PR回读绑定；独立主线审阅是否完成以实际记录为准，不称正式CI已通过。
- CI-004：本次不修改检查器、依赖或workflow；范围必须保持既有纯Scale intake，不能因目录候选启动平台全量。
- DB opt-in、UI、Docker、CodeQL查询改动及生产恢复等不涉及本候选，未运行无关测试。

本地执行：`node --import tsx /tmp/harvard-tsr-source/verify-boundary.ts`（backend工作目录），退出0。该一次性探针仅调用既有registry/read-model/materialize拒绝路径，并检查六份编辑示例的结构；源码SHA-256=`ebd1170b7a7c8e81108d9bc6c63f9605621f5742a4faf43cf35ba259feb2239e`。4项目录可发现但不可启动；runtime policy/executable不存在；报告资格为空；materialize在任何DB属性读取之前拒绝。DB访问次数0。此探针没有执行计分、实际报告生成、浏览器或隔离库导入。原题本附录49页已本地渲染核图；字体缓存警告未使渲染失败。

首次交付提交`cc37aad62e2059595fb075457b8c1d55f2e3d7b5`保留`[skip ci]`，当时正式CI未启动；Draft创建操作被拒且已按分支回查确认未创建。主线随后传入本批公开提交及Draft PR的新增明确确认，指示创建后回读真实CI。本次仅更新交接说明，以不含跳过标记的新head创建Draft并观察现有Scale轻路线；原始source、索引、报告文稿及本地验证输入不变，不重跑已通过的本地探针。独立审阅、门禁真实结果与合并决定仍分别记录；新确认不构成题项许可或生产修改授权。

预计正式路线：`content` / `scale_intake_light=true`，主CI scope → 既有content-boundary/scale-intake（generator --check、4项selected source contract及静态依赖核对）→ 既有稳定汇总。此处为创建前计划，真实run/head/attempt/job结果由PR及最终交付回读，不能以计划或旧skip记录声称通过。选中合同包含schema，任何已有本地输入/证据接纳是否受支持以现代码为准，不伪造接纳结果；不添加新签名框架。5分钟为等待状态报告阈值，不是启动全量测试的理由。

管理员/主线剩余：独立review及内容轻CI真实结果；权利、完整选项、计分及独立施测资料；生产/自建库同义ID核查。没有请求或执行合并、生产写库、部署。
