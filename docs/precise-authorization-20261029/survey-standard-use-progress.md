# Survey 精确量表配置与原入口修订

在已合入 main `e65d87222d351e5dfde52e389f3aa403380443eb` 的独立任务分支上实现。沿用 `survey_tool_grants` 不可变 snapshot、原 `catalog_grant_id`、导入只读规则、波次发布和 START 准入；未新建表、权限中心或报告引擎。

原授权 API 新增可选严格 `exact: {requestId, configurationName}`，只接受真实已批准的 `survey-standard:<UUID>` SCALE 来源。管理员与接收研究者仍由原入口/账号规则分别验证，不能请求替换 issuer、轴内容或 selectedBinding。旧调用、个人/共用库与 Bundle 路径保持原协议。

T1 保存精确 C/P/R、M、原 Survey 管理入口 ID/修订和业务名称；完整 requestId 意图包含发行者、接收者、精确 source、名称和权限依据。同编号改变目标或名称拒绝，已撤销原请求重试只返回原撤销状态。针对同接收者同工具的业务名称有事务锁，同名有效配置不能签发成任意二选一。新专用回读 API 仅查询本人的原精确请求，支持正常撤回后的回读；不授予研究答案访问权。

T2 由现有草稿 FK 绑定不可变授权，导入/复制/发布保留原身份。只在普通来源重新核验时剥离这三个已验证的 grant 字段：selectedBinding、configurationName、configurationRequestIntentHash；完整原来源、计分、呈现和其他 provenance 仍按原 canonical 身份核对，不把源内容漂移当成 grant 元数据。

T3 只在新 START 校验当前项目拥有者的原精确 use 与冻结 binding 相同，并以原入口 ID/修订核发行管理员当前有效性；不是寻找同人新入口修订。身份批量读取不加载完整报告；后续 source/policy 等待后才核当前管理资格/到期时间。旧任务/续答/历史读取不加当前 grant 依赖，缺旧 binding 保留 legacy 路径。新权限读取有上限，用户锁 NOWAIT 避免与账号生命周期倒序等待；事务忙给可重试业务提示。这里尚未测量完整 START 性能。

实际独立库证据：首轮业务 5 PASS，补充最终路径 2 PASS。正常批准两个已有 R（完整报告与 none-v1 无反馈），C/P 相同，给两个接收者，实际导入、显式发布测量版本并冻结两份波次；冻结身份与 T1 相同。伪造冻结 binding 被拒；正常撤销原管理员资格后新导入/发布/START guard 被拒，历史快照原样可读。补充用既有系统 API 授予入口新修订 3，原修订 1 仍不能入场；只有新明确签发配置能导入、发布、冻结并过准入 guard。新 use 普通撤销后同请求重试保持 REVOKED，冻结历史不变。测试使用真实 DB/服务及准入 guard，未执行浏览器、真人 MFA、participant attempt/交卷或报告 UI，不能替代 Survey 端到端验收。

初始化两次失败均保留：第一次测试误用未映射 Prisma 表，回读 8 actors/0 grants/0 projects 后修正；第二次遗漏新 fixture 的显式 project UUID，回读 10 actors/0 grants/0 projects/1 account/1 manager entry 后显式续接同库，不删除或重建。两次均 5 skipped、业务未执行，不能算成功。最终业务 5 PASS；调整检查时序后没有重跑这五个，另新增 2 个修订场景并通过。最终后端/测试闭包类型检查退出 0。

本阶段新增接口已挂现有密码/近期验证路由，尚未以实际 HTTP 或前端验证。管理员手选轴 UI、业务名称/恢复 UI、消费者去技术选择、participant 全链路、并发/期限边界、legacy dry-run、同环境性能与正式 CI 仍待完成。没有注册 fun R、导入候选认知引擎或生产操作。main 纯素材更新只对齐代码与来源，c52 的 88 rows setup 证据没有改写成 e65 全装载成功。
