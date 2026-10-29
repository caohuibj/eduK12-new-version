# Survey 精确授权的参与者实际 HTTP 链路

基线 `d2e4d4178881cb8d3d64cf9cd8e79155498e778d`，本阶段仅新增测试/证据，
没有修改业务实现或素材。使用 `precise_survey_journey_test_20261029`，从保留的
replacement 合成库独立克隆，未触碰原库或生产。

原管理员已发行的 `HTTP 明确替换配置`，其 R 为显式空值。用真实 Cookie、对应
CSRF、当前研究者资格和普通路由完成项目创建、精确 grant 导入、只读条目编辑
拒绝、测量发布、波次创建、prepare/open。publication 保留原 selectedBinding 和
sourceGrantId。另一合法研究者访问此项目被拒绝；参与者投影没有 C/P/R 技术字段、
计分规则或私有来源。

实际匿名 START 分配 1 份作答；随后原入口管理员经现有密码/近期管理 proof 路由
普通撤销 use。新的 START 实际返回 409，原因是原精确 grant 已撤销；原已入场
作答仍能读取任务、按冻结 ONE_BY_ONE 协议交卷和回读既定通用反馈。重复 FINAL
返回同一回执、仅 1 条最终记录；错误参与者凭证返回 403。原 T1/源组合/此前 5 份
publication 均未改写。末次只读回查为波次 OPEN、starts_count=1、作答 COMPLETED、
FINAL=1、reportConfigured=false、原 use REVOKED；原报告轴 hash 是 canonical null，
源 R payload 仍为 null。GENERAL_ONLY 是该来源及研究反馈约定，不声称已展示完整 R。

两条不同用例通过于分阶段续跑，并非一次无失败全验：

1. 首轮创建项目/导入成功；误用 PUT 而非现有 PATCH，收到非 JSON，后续阶段停止。
   该次状态未在 JSON 解析前记录，不能补写成已观测的特定状态。只读回查
   1 项目/1 草稿/0 波次/5 publication、原 use ACTIVE，随后明确读取原数据继续，
   未重建项目或重复导入。
2. 续跑的第一用例通过，第二用例实际收到了预期意义上的撤权拒绝，但断言误写
   403；现有精确契约返回 409。保留失败，先确认 use REVOKED、1 份 STARTED、
   0 FINAL，之后过滤已通过的第一用例，恢复同一作答，不重复撤权或 START。
3. FINAL 首次因缺少 ONE_BY_ONE 必需逐题计时而返回 400；作答仍 STARTED、0 FINAL。
   仅补已有 schema 的明确合成计时（不代表人体反应时间或性能测量），再执行剩余
   用例通过。原来源、授权、计分与播放协议未变，未放宽校验。

各次合计 20 个有状态记录的实际 HTTP 请求，另有首轮未记录状态的非 JSON 响应。
最终 Node 24.21.0 后端闭包类型检查退出 0。对应 raw reporter、过滤/失败、命令、
时间和回查见 [原始证据](survey-exact-journey-raw.json) 与
[verification](survey-exact-journey-verification.json)。恢复 capability 仅存本节点
0600 私有文件，未入 Git；请求记录不含 Cookie、口令或 capability。

权限 fixture 使用合成 JWT 近期 MFA/admin proof，未进行真实 MFA 仪式或浏览器体验。
仅 owner DB 角色、无 runtime-role/负载或正式 CI 资格。未重跑三量表原合成报告计算，
未新增/发布工具、给真实用户授权、合并 main 或生产上线。该结果补齐此 Survey
精确 no-R 参与者路径，不替代 Training COURSE、全 R、多规模性能或认知四入口验收。
