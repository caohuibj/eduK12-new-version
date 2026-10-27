# 教育登记反馈时间的最小生产端适配

在已验证 marker checkpoint `9ce3f44d7c1b2fb5025a8c6442f61faaa3ec3e9b`
之后，仅 cherry-pick root 合同 `385277be09228ace5d9ff8da1bbd8934d86cd471`
（本分支对应 `16845c9a2`），没有重跑 root 的合同或锁竞争检查。

`assessment-resource.service.ts` 的 register 请求现在必需显式
`feedbackPolicy: {schemaVersion:1,mode:'IMMEDIATE'} | {schemaVersion:1,
mode:'SCHEDULED',releaseAt:ISO_WITH_OFFSET}`。直接复用原 Training schema 和
`parseTrainingFeedbackPolicy`；先验证再将 SCHEDULED 转 UTC，禁止 null/缺字段
隐式 fallback。prepare 不接时间。规范化后的 policy 写入 origin，因此已有
entry/origin hash 和原登记请求 inputHash 都自然包含它，不新增 policyhash 或列。

等价时区表示归一后可重放同一请求；登记后的时间/模式变更仍拒绝
`EDUCATION_ASSESSMENT_ALREADY_FROZEN`，需要新 delivery。GET/readback 原样返回
entry；历史缺 policy 仍缺，不回填、不改 hash。内部 P/R 校验仅接其真正使用的
references/reports，旧历史审核/内容选择不需要伪造 feedbackPolicy。

现有 marker/普通 PG fixture 的 register 输入只增显式 IMMEDIATE，未重跑已经通过
的5个 marker PG 或18个普通生产者 case。管理 UI/client、反馈 evaluator/router
仍由各自线程接入；它们应发上述必需字段，消费 origin 中已冻结的可选字段。
没有修改这些线程文件、凭据、迁移或权限模型。

仅运行新增两文件：
`vitest run src/__tests__/education-tools/assessment-resource.feedback-policy.test.ts
src/__tests__/education-tools/assessment-resource.feedback-policy.postgres.integration.test.ts
--reporter=verbose`。退出0、4 passed：2 API schema、2真实PG。
PG16.15 的 `eduk12_pr363_publication_test` 中，真实准备/登记/独审/发布冻结 UTC；
同义 UTC 请求幂等成功、更换已登记模式拒绝。旧 hash 用先前真实 privateVersion
发布 `dcb0c636-f468-426d-9e8b-b43e4db10cc3` 回读验证，必须显式设置
`EDUCATION_PRIVATE_MARKER_RESOURCE_ID`，不会在未来无此夹具时假称覆盖历史读取。
新定时 case 的源是明确合成的已发布纯 Form DB fixture；没有声称它验证了工具
编制/原始审批或实际受试者反馈开放。旧 hash 的 root 纯合同证据原样复用。

首轮 types 退出2：内部 P/R helper 误依赖完整 register DTO，两个只读调用缺新字段。
已收窄 helper 静态参数为 `Pick<..., 'references'|'reports'>`，没有改其运行逻辑或
给历史来源补默认值；因此不重复已经通过的 PG。
最终 backend `tsc --noEmit` r2 退出0；`git diff --check` 退出0。
原 types 失败与 PG 成功原件保存在 `source-feedback-policy-evidence/`。
没有 CI、PR 合并、部署或真实工具批准。
