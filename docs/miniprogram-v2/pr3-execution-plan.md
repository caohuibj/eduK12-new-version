# PR3：Assessment Runtime 与报告（本地实施）

基线 ef5b2747；本地分支 codex/miniprogram-v2-runtime。用户已授权在现有基础上完成 PR3 本地开发，继续不推送、不创建远程 PR、不部署。

PR3 是原计划的最后开发阶段，但不取代 PR1/PR2 剩余对等功能、正式内容发布、完整门禁或微信设备验收。所有状态必须与实际证据一致。

## 交付顺序与约束

1. 统一 Runtime 核心：精确冻结身份、加密且按账号隔离的本地草稿、单元提交封存、稳定 submissionId、显式重试/冲突/恢复、退出清理、前后台保护。严格只调用现有 FINAL_ONLY 接口，无逐题后台写入。
2. Renderer Registry：量表与表单复用同一控件；问卷和综合测评只编排服务端当前单元。冻结定义未支持的媒体/分支/复杂题型须明确进入同源正式 Web Runtime，不能隐藏题目或降低测量要求。
3. 情境及认知：复用正式 SJT contract；认知使用现有 Web Runtime，等待原生输入/计时/音视频/设备验证。Web-view使用既有 Web 登录体系，不把小程序会话、恢复凭证或孩子报告放入 URL，也不新增自动跨端会话授予。
4. Report Domain：仅展示服务器已有的 canonical DTO、解释与免责声明；不计算分数、百分位、风险等级、变化或建议。保持各 audience、组织、subject/respondent 和 publication 边界。
5. 家长闭环：接通精确报告同意和已持有披露能力者的审批入口；正式 PARENT 生产/发布需可验证的来源与单独模板。沿用工具披露上限、学生确认/逐份同意、负责人逐份授权及撤销。未确认的组织能力授予界面仍不纳入。
6. 验证：故障/重复点击/已封存重试/429/5xx/存储失败/进程重建/后台/身份变化/冲突 fixtures；实际本机 Cookie/CSRF/数据库 contract；Web 回归、类型和构建；矩阵标明 native/Web/未验收。微信编译与真机单独验收。

## 高风险决策

正式家长报告没有现成通用 PARENT 内容生产器。不得把教师、研究或学生报告正文自动转换为家长报告；实现前提交具体的来源、发布、指标和不可变绑定方案确认。其余低风险适配继续实施。

原生能力选择和服务器最终提交授权分离；客户端 renderer capability 不产生业务权限。Web Runtime 同源路径只允许服务器现有 launch/report target 的已知路由，并在 Web 重新核对会话与权限。


## 本地执行结果

统一 Runtime、原生/正式 Web renderer 分流、canonical 报告、本人纵向元数据批量列表、已批准的独立家长发布/同意/授权链已实现；三项 PR1/PR2 P2 已整合修复。每工具家长教育内容、完整业务对等、微信编译/真机/timing 与 Full Gate 仍是独立剩余条件。实现矩阵和验证见 `implementation-status.md`、`pr3-local-acceptance-20261002.md`，不以第三开发阶段代替发布验收。
